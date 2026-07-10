import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-zinc-200 dark:bg-zinc-950 px-4">
            <Card className="w-full max-w-md py-8">
                <CardHeader className="px-8">
                    <CardTitle className="text-lg font-medium">Confirmar invitación</CardTitle>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {valid
                            ? "Haz clic en el botón para confirmar tu invitación y definir tu contraseña."
                            : "El enlace no es válido o está incompleto."}
                    </p>
                </CardHeader>
                <CardContent className="px-8">
                    {valid ? (
                        <form action={confirmInvitation}>
                            <input type="hidden" name="token_hash" value={tokenHash} />
                            <input type="hidden" name="type" value={type} />
                            <input type="hidden" name="next" value={next} />
                            <Button
                                type="submit"
                                className="w-full h-11 rounded-lg dark:border dark:border-zinc-600 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                            >
                                Confirmar invitación
                            </Button>
                        </form>
                    ) : (
                        <Button
                            asChild
                            variant="outline"
                            className="w-full h-11 rounded-lg dark:border-zinc-600 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                            <Link href="/login">Ir al inicio de sesión</Link>
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
