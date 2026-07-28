"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { UserPlus, RefreshCw, Trash2 } from "lucide-react";

type Role = "administrator" | "user";

interface AdminUser {
    id: string;
    email: string;
    role: Role;
    pending: boolean;
    created_at: string;
    last_sign_in_at: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
    administrator: "Administrador",
    user: "Usuario",
};

const ERROR_MESSAGES: Record<string, string> = {
    email_exists: "Ya existe un usuario con ese email.",
    domain_not_allowed: "El dominio del email no está permitido.",
    invite_failed: "No se pudo enviar la invitación. Intente nuevamente.",
    role_assignment_failed: "Usuario invitado, pero no se pudo asignar el rol. Cámbielo desde la lista.",
    cannot_degrade_self: "No puede quitarse el rol de administrador a sí mismo.",
    cannot_delete_self: "No puede eliminarse a sí mismo.",
    already_active: "El usuario ya está activo; no hay invitación pendiente.",
    resend_failed: "No se pudo reenviar la invitación. Intente nuevamente.",
    update_failed: "No se pudo actualizar el rol. Intente nuevamente.",
    delete_failed: "No se pudo eliminar el usuario. Intente nuevamente.",
};

function errorMessage(code: string | undefined): string {
    return (code && ERROR_MESSAGES[code]) || "Ocurrió un error. Intente nuevamente.";
}

const selectClass =
    "h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50";

export default function AdminUsersPage() {
    const { data, isLoading: loading, error, mutate } = useSWR<{
        users: AdminUser[];
        caller_id: string;
    }>("/api/admin/users", fetcher, { revalidateOnFocus: false });
    const users = data?.users ?? [];
    const callerId = data?.caller_id ?? null;
    const pageError = error ? "No se pudo cargar la lista de usuarios." : null;

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>("user");
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteOk, setInviteOk] = useState<string | null>(null);

    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const [rowOk, setRowOk] = useState<string | null>(null);

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault();
        setInviteError(null);
        setInviteOk(null);
        setInviting(true);
        try {
            const res = await fetch("/api/admin/users/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });
            if (res.ok) {
                setInviteOk(`Invitación enviada a ${inviteEmail}.`);
                setInviteEmail("");
                setInviteRole("user");
                await mutate();
            } else {
                const data = await res.json().catch(() => ({}));
                setInviteError(errorMessage(data.error));
            }
        } catch {
            setInviteError("Error de red. Intente nuevamente.");
        } finally {
            setInviting(false);
        }
    }

    async function handleRoleChange(user: AdminUser, role: Role) {
        setRowError(null);
        setRowOk(null);
        setBusyId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            if (res.ok) {
                setRowOk(`Rol de ${user.email} actualizado. Aplica cuando renueve su sesión.`);
                await mutate();
            } else {
                const data = await res.json().catch(() => ({}));
                setRowError(errorMessage(data.error));
            }
        } catch {
            setRowError("Error de red. Intente nuevamente.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleResend(user: AdminUser) {
        setRowError(null);
        setRowOk(null);
        setBusyId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/resend`, { method: "POST" });
            if (res.ok) {
                setRowOk(`Invitación reenviada a ${user.email}.`);
                await mutate();
            } else {
                const data = await res.json().catch(() => ({}));
                setRowError(errorMessage(data.error));
            }
        } catch {
            setRowError("Error de red. Intente nuevamente.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(user: AdminUser) {
        setRowError(null);
        setRowOk(null);
        setBusyId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
            if (res.ok) {
                setRowOk(`Usuario ${user.email} eliminado.`);
                await mutate();
            } else {
                const data = await res.json().catch(() => ({}));
                setRowError(errorMessage(data.error));
            }
        } catch {
            setRowError("Error de red. Intente nuevamente.");
        } finally {
            setBusyId(null);
            setConfirmDeleteId(null);
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
            <AdminPageHeader backHref="/admin/config" title="Gestión de usuarios" />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <UserPlus className="w-4 h-4" />
                        Invitar usuario
                    </CardTitle>
                    <CardDescription>
                        Se enviará un email con un enlace para crear la contraseña.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            disabled={inviting}
                            required
                            placeholder="email@dominio.com"
                            aria-label="Email"
                            className="flex-1 h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        />
                        <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as Role)}
                            disabled={inviting}
                            aria-label="Rol"
                            className={selectClass}
                        >
                            <option value="user">Usuario</option>
                            <option value="administrator">Administrador</option>
                        </select>
                        <Button type="submit" disabled={inviting || !inviteEmail}>
                            {inviting ? "Enviando..." : "Invitar"}
                        </Button>
                    </form>
                    {inviteError && (
                        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{inviteError}</p>
                    )}
                    {inviteOk && <p className="mt-3 text-sm text-green-700 dark:text-green-300">{inviteOk}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Usuarios</CardTitle>
                </CardHeader>
                <CardContent>
                    {rowError && (
                        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">{rowError}</p>
                    )}
                    {rowOk && <p className="mb-3 text-sm text-green-700 dark:text-green-300">{rowOk}</p>}

                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : pageError ? (
                        <p className="text-sm text-red-600 dark:text-red-400" role="alert">{pageError}</p>
                    ) : users.length === 0 ? (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay usuarios.</p>
                    ) : (
                        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {users.map((user) => {
                                const isSelf = user.id === callerId;
                                const busy = busyId === user.id;
                                return (
                                    <li
                                        key={user.id}
                                        className="py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                                {user.email}
                                                {isSelf && (
                                                    <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">(usted)</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {user.pending ? (
                                                    <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800">
                                                        Pendiente
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-green-700 dark:text-green-300 border-green-300 dark:border-green-800">
                                                        Activo
                                                    </Badge>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isSelf ? (
                                                <span className="text-sm text-zinc-600 dark:text-zinc-400 px-3">
                                                    {ROLE_LABELS[user.role]}
                                                </span>
                                            ) : (
                                                <select
                                                    value={user.role}
                                                    onChange={(e) =>
                                                        handleRoleChange(user, e.target.value as Role)
                                                    }
                                                    disabled={busy}
                                                    aria-label={`Rol de ${user.email}`}
                                                    className={selectClass}
                                                >
                                                    <option value="user">Usuario</option>
                                                    <option value="administrator">Administrador</option>
                                                </select>
                                            )}
                                            {user.pending && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => handleResend(user)}
                                                    title="Reenviar invitación"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                    Reenviar
                                                </Button>
                                            )}
                                            {!isSelf &&
                                                (confirmDeleteId === user.id ? (
                                                    <>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() => handleDelete(user)}
                                                        >
                                                            {busy ? "Eliminando..." : "Confirmar"}
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() => setConfirmDeleteId(null)}
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={busy}
                                                        onClick={() => setConfirmDeleteId(user.id)}
                                                        title="Eliminar usuario"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                    </Button>
                                                ))}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
