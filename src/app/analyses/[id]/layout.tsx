import { AnalysisBreadcrumb } from "@/components/AnalysisBreadcrumb";

export default function AnalysisLayout({
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
