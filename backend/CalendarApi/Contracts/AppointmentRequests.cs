namespace CalendarApi.Contracts;

public record CreateAppointmentRequest(
    string Title,
    DateTime Start,
    DateTime End,
    string? Color,
    string? Recurrence,
    DateTime? RecurrenceUntil
);

public record UpdateAppointmentRequest(
    string Title,
    DateTime Start,
    DateTime End,
    string? Color,
    string? Recurrence,
    DateTime? RecurrenceUntil
);
