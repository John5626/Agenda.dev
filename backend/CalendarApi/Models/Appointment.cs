using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CalendarApi.Models;

public class Appointment
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonElement("title")]
    public string Title { get; set; } = "";

    [BsonElement("start")]
    public DateTime Start { get; set; } 

    [BsonElement("end")]
    public DateTime End { get; set; }   

    [BsonElement("color")]
    public string Color { get; set; } = "#3b82f6";

    [BsonElement("recurrence")]
    public string Recurrence { get; set; } = "none";

    [BsonElement("recurrenceUntil")]
    public DateTime? RecurrenceUntil { get; set; }

    [BsonElement("seriesId")]
    public string? SeriesId { get; set; }
}
