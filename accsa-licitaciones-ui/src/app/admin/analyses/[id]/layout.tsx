import { AnalysisBreadcrumb } from "@/components/AnalysisBreadcrumb";

export default function AdminAnalysisLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <AnalysisBreadcrumb />
            {children}
        </>
    );
}
