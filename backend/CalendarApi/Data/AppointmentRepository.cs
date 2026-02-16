using CalendarApi.Models;
using MongoDB.Driver;

namespace CalendarApi.Data;

public class AppointmentRepository
{
    private readonly IMongoCollection<Appointment> _col;

    public AppointmentRepository(MongoContext ctx)
    {
        _col = ctx.Appointments;
    }

    public async Task<List<Appointment>> GetRangeAsync(DateTime fromUtc, DateTime toUtc)
    {
        var filter = Builders<Appointment>.Filter.And(
            Builders<Appointment>.Filter.Lt(x => x.Start, toUtc),
            Builders<Appointment>.Filter.Gt(x => x.End, fromUtc)
        );

        return await _col.Find(filter).SortBy(x => x.Start).ToListAsync();
    }

    public async Task<Appointment?> GetByIdAsync(string id) =>
        await _col.Find(x => x.Id == id).FirstOrDefaultAsync();

    public async Task<Appointment> CreateAsync(Appointment a)
    {
        await _col.InsertOneAsync(a);
        return a;
    }

    public async Task CreateManyAsync(IEnumerable<Appointment> appointments)
    {
        var list = appointments.ToList();
        if (list.Count == 0) return;
        await _col.InsertManyAsync(list);
    }

    public async Task<bool> UpdateAsync(string id, Appointment a)
    {
        a.Id = id;
        var res = await _col.ReplaceOneAsync(x => x.Id == id, a);
        return res.MatchedCount == 1;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var res = await _col.DeleteOneAsync(x => x.Id == id);
        return res.DeletedCount == 1;
    }

    public async Task<long> DeleteBySeriesAsync(string seriesId)
    {
        var res = await _col.DeleteManyAsync(x => x.SeriesId == seriesId);
        return res.DeletedCount;
    }

    public async Task<long> DeleteBySeriesFromAsync(string seriesId, DateTime fromStartUtc)
    {
        var res = await _col.DeleteManyAsync(x => x.SeriesId == seriesId && x.Start >= fromStartUtc);
        return res.DeletedCount;
    }

    public async Task<long> DeleteBySeriesFromExceptAsync(string seriesId, DateTime fromStartUtc, string exceptId)
    {
        var res = await _col.DeleteManyAsync(
            x => x.SeriesId == seriesId && x.Start >= fromStartUtc && x.Id != exceptId
        );
        return res.DeletedCount;
    }
}
