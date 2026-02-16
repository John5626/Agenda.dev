using CalendarApi.Contracts;
using CalendarApi.Data;
using CalendarApi.Models;
using Microsoft.AspNetCore.Mvc;

namespace CalendarApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AppointmentsController : ControllerBase
{
    private const string RecurrenceNone = "none";
    private const string RecurrenceDaily = "daily";
    private const string RecurrenceWeekly = "weekly";
    private const string RecurrenceMonthly = "monthly";

    private readonly AppointmentRepository _repo;

    public AppointmentsController(AppointmentRepository repo)
    {
        _repo = repo;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (to <= from) return BadRequest("Query inválida: 'to' deve ser > 'from'.");

        var fromUtc = DateTime.SpecifyKind(from, DateTimeKind.Utc);
        var toUtc = DateTime.SpecifyKind(to, DateTimeKind.Utc);

        var list = await _repo.GetRangeAsync(fromUtc, toUtc);
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAppointmentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title é obrigatório.");
        if (req.End <= req.Start) return BadRequest("End deve ser > Start.");

        var recurrence = NormalizeRecurrence(req.Recurrence);
        if (!IsValidRecurrence(recurrence)) return BadRequest("Recurrence inválida.");

        var startUtc = ToUtc(req.Start);
        var endUtc = ToUtc(req.End);
        var color = string.IsNullOrWhiteSpace(req.Color) ? "#3b82f6" : req.Color!;

        if (recurrence == RecurrenceNone)
        {
            var appt = new Appointment
            {
                Title = req.Title.Trim(),
                Start = startUtc,
                End = endUtc,
                Color = color,
                Recurrence = RecurrenceNone,
                RecurrenceUntil = null,
                SeriesId = null
            };

            await _repo.CreateAsync(appt);
            return Created($"/api/appointments/{appt.Id}", appt);
        }

        if (!req.RecurrenceUntil.HasValue)
            return BadRequest("RecurrenceUntil é obrigatório para eventos recorrentes.");

        var untilUtc = ToUtc(req.RecurrenceUntil.Value);
        if (untilUtc < startUtc)
            return BadRequest("RecurrenceUntil deve ser >= Start.");

        var seriesId = Guid.NewGuid().ToString("N");
        var occurrences = BuildOccurrences(
            req.Title.Trim(),
            color,
            startUtc,
            endUtc,
            recurrence,
            untilUtc,
            seriesId
        );

        if (occurrences.Count == 0) return BadRequest("Nenhuma ocorrência gerada.");

        await _repo.CreateManyAsync(occurrences);
        var first = occurrences[0];
        return Created($"/api/appointments/{first.Id}", first);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateAppointmentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title é obrigatório.");
        if (req.End <= req.Start) return BadRequest("End deve ser > Start.");

        var existing = await _repo.GetByIdAsync(id);
        if (existing is null) return NotFound();

        var recurrence = NormalizeRecurrence(req.Recurrence);
        if (!IsValidRecurrence(recurrence)) return BadRequest("Recurrence inválida.");

        var startUtc = ToUtc(req.Start);
        var endUtc = ToUtc(req.End);
        var color = string.IsNullOrWhiteSpace(req.Color) ? "#3b82f6" : req.Color!;

        if (recurrence == RecurrenceNone)
        {
            var singleAppt = new Appointment
            {
                Title = req.Title.Trim(),
                Start = startUtc,
                End = endUtc,
                Color = color,
                Recurrence = RecurrenceNone,
                RecurrenceUntil = null,
                SeriesId = null
            };

            var okSingle = await _repo.UpdateAsync(id, singleAppt);
            return okSingle ? Ok(singleAppt) : NotFound();
        }

        if (!req.RecurrenceUntil.HasValue)
            return BadRequest("RecurrenceUntil é obrigatório para eventos recorrentes.");

        var untilUtc = ToUtc(req.RecurrenceUntil.Value);
        if (untilUtc < startUtc)
            return BadRequest("RecurrenceUntil deve ser >= Start.");

        var seriesId = string.IsNullOrWhiteSpace(existing.SeriesId) ? Guid.NewGuid().ToString("N") : existing.SeriesId!;

        var updated = new Appointment
        {
            Title = req.Title.Trim(),
            Start = startUtc,
            End = endUtc,
            Color = color,
            Recurrence = recurrence,
            RecurrenceUntil = untilUtc,
            SeriesId = seriesId
        };

        var ok = await _repo.UpdateAsync(id, updated);
        if (!ok) return NotFound();

        await _repo.DeleteBySeriesFromExceptAsync(seriesId, startUtc, id);

        var futures = BuildFutureOccurrences(
            req.Title.Trim(),
            color,
            startUtc,
            endUtc,
            recurrence,
            untilUtc,
            seriesId
        );

        await _repo.CreateManyAsync(futures);
        return Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, [FromQuery] string? scope = "single")
    {
        var normalizedScope = (scope ?? "single").Trim().ToLowerInvariant();
        if (normalizedScope is not ("single" or "following" or "all"))
            return BadRequest("Scope inválido. Use: single, following, all.");

        var existing = await _repo.GetByIdAsync(id);
        if (existing is null) return NotFound();

        var hasSeries = existing.Recurrence != RecurrenceNone && !string.IsNullOrWhiteSpace(existing.SeriesId);

        if (normalizedScope == "single" || !hasSeries)
        {
            var okSingle = await _repo.DeleteAsync(id);
            return okSingle ? NoContent() : NotFound();
        }

        if (normalizedScope == "all")
        {
            var deletedAll = await _repo.DeleteBySeriesAsync(existing.SeriesId!);
            return deletedAll > 0 ? NoContent() : NotFound();
        }

        var deletedFollowing = await _repo.DeleteBySeriesFromAsync(existing.SeriesId!, existing.Start);
        return deletedFollowing > 0 ? NoContent() : NotFound();
    }

    private static DateTime ToUtc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static bool IsValidRecurrence(string recurrence) =>
        recurrence is RecurrenceNone or RecurrenceDaily or RecurrenceWeekly or RecurrenceMonthly;

    private static string NormalizeRecurrence(string? recurrence) =>
        string.IsNullOrWhiteSpace(recurrence) ? RecurrenceNone : recurrence.Trim().ToLowerInvariant();

    private static (DateTime Start, DateTime End) AdvanceOccurrence(DateTime startUtc, DateTime endUtc, string recurrence)
    {
        return recurrence switch
        {
            RecurrenceDaily => (startUtc.AddDays(1), endUtc.AddDays(1)),
            RecurrenceWeekly => (startUtc.AddDays(7), endUtc.AddDays(7)),
            RecurrenceMonthly => (startUtc.AddMonths(1), endUtc.AddMonths(1)),
            _ => (startUtc, endUtc)
        };
    }

    private static List<Appointment> BuildOccurrences(
        string title,
        string color,
        DateTime startUtc,
        DateTime endUtc,
        string recurrence,
        DateTime untilUtc,
        string seriesId
    )
    {
        const int maxOccurrences = 1500;
        var occurrences = new List<Appointment>();

        var cursorStart = startUtc;
        var cursorEnd = endUtc;

        for (var i = 0; i < maxOccurrences && cursorStart <= untilUtc; i++)
        {
            occurrences.Add(new Appointment
            {
                Title = title,
                Start = cursorStart,
                End = cursorEnd,
                Color = color,
                Recurrence = recurrence,
                RecurrenceUntil = untilUtc,
                SeriesId = seriesId
            });

            (cursorStart, cursorEnd) = AdvanceOccurrence(cursorStart, cursorEnd, recurrence);
        }

        return occurrences;
    }

    private static List<Appointment> BuildFutureOccurrences(
        string title,
        string color,
        DateTime startUtc,
        DateTime endUtc,
        string recurrence,
        DateTime untilUtc,
        string seriesId
    )
    {
        const int maxOccurrences = 1500;
        var occurrences = new List<Appointment>();

        var (cursorStart, cursorEnd) = AdvanceOccurrence(startUtc, endUtc, recurrence);

        for (var i = 0; i < maxOccurrences && cursorStart <= untilUtc; i++)
        {
            occurrences.Add(new Appointment
            {
                Title = title,
                Start = cursorStart,
                End = cursorEnd,
                Color = color,
                Recurrence = recurrence,
                RecurrenceUntil = untilUtc,
                SeriesId = seriesId
            });

            (cursorStart, cursorEnd) = AdvanceOccurrence(cursorStart, cursorEnd, recurrence);
        }

        return occurrences;
    }
}
