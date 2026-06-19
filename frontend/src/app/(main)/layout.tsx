import Sidebar from '@/components/ui/Sidebar';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f5ff 0%, #e0ecff 50%, #f0f5ff 100%)' }}>
            <Sidebar />
            <main className="lg:ml-[240px] pt-14 lg:pt-0 min-h-screen">
                {children}
            </main>
        </div>
    );
}