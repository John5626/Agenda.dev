using CalendarApi.Models;
using MongoDB.Driver;

namespace CalendarApi.Data;

public class MongoContext
{
    public IMongoCollection<Appointment> Appointments { get; }

    public MongoContext(IConfiguration config)
    {
        var conn = config["MONGO_CONNECTION_STRING"] ?? "mongodb://mongo:27017";
        var dbName = config["MONGO_DB"] ?? "calendar";

        var client = new MongoClient(conn);
        var db = client.GetDatabase(dbName);

        Appointments = db.GetCollection<Appointment>("appointments");
    }
}
