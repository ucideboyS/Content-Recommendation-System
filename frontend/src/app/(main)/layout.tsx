import Navbar from '@/components/ui/Navbar';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black">
            <Navbar />
            <main>
                {children}
            </main>
        </div>
    );
} 