export type Recurrence = "none" | "daily" | "weekly" | "monthly";
export type DeleteScope = "single" | "following" | "all";

export type Appointment = {
  id?: string;
  title: string;
  start: string;
  end: string;
  color: string;
  recurrence: Recurrence;
  recurrenceUntil?: string | null;
  seriesId?: string | null;
};

export type CreateAppointmentPayload = {
  title: string;
  start: string;
  end: string;
  color: string;
  recurrence: Recurrence;
  recurrenceUntil?: string | null;
};

export type UpdateAppointmentPayload = {
  title: string;
  start: string;
  end: string;
  color: string;
  recurrence: Recurrence;
  recurrenceUntil?: string | null;
};

export async function listAppointments(fromIso: string, toIso: string): Promise<Appointment[]> {
  const url = `/api/appointments?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao listar: ${res.status}`);
  return res.json();
}

export async function createAppointment(a: CreateAppointmentPayload): Promise<Appointment> {
  const res = await fetch(`/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(a)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erro ao criar: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function deleteAppointment(id: string, scope: DeleteScope = "single"): Promise<void> {
  const res = await fetch(`/api/appointments/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erro ao deletar: ${res.status} ${txt}`);
  }
}

export async function updateAppointment(id: string, payload: UpdateAppointmentPayload): Promise<Appointment> {
  const res = await fetch(`/api/appointments/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erro ao atualizar: ${res.status} ${txt}`);
  }
  return res.json();
}
