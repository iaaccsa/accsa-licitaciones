import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
    if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
    return next;
}

// Verification runs only on this user-triggered POST, never on the GET that
// renders the page. Email security scanners (e.g. Microsoft 365 Safe Links)
// pre-fetch links with GET; verifying there would consume the single-use token
// before the human clicks, making valid invites look expired.
async function confirmInvitation(formData: FormData) {
    "use server";

    const tokenHash = formData.get("token_hash");
    const type = formData.get("type");
    const nextRaw = formData.get("next");
    const next = safeNext(typeof nextRaw === "string" ? nextRaw : null);

    if (typeof tokenHash !== "string" || typeof type !== "string") {
        redirect("/login?error=invalid_link");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash,
    });
    if (error) {
        redirect("/login?error=invalid_link");
    }

    redirect(next);
}

export default async function ConfirmPage({
    searchParams,
}: {
    searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
    const params = await searchParams;
    const tokenHash = params.token_hash ?? "";
    const type = params.type ?? "";
    const next = safeNext(params.next ?? null);
    const valid = Boolean(tokenHash && type);

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                        <MailCheck className="h-6 w-6 text-blue-700" />
                    </div>
                    <CardTitle>Confirmar invitación</CardTitle>
                    <CardDescription>
                        {valid
                            ? "Hacé clic en el botón para confirmar tu invitación y definir tu contraseña."
                            : "El enlace no es válido o está incompleto."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {valid ? (
                        <form action={confirmInvitation}>
                            <input type="hidden" name="token_hash" value={tokenHash} />
                            <input type="hidden" name="type" value={type} />
                            <input type="hidden" name="next" value={next} />
                            <Button type="submit" className="w-full">
                                Confirmar invitación
                            </Button>
                        </form>
                    ) : (
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/login">Ir al inicio de sesión</Link>
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
