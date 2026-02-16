using CalendarApi.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddSingleton<MongoContext>();
builder.Services.AddSingleton<AppointmentRepository>();

var app = builder.Build();

app.MapControllers();

app.Run();
