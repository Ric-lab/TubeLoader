import Link from 'next/link';

export function Navbar() {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/20 bg-white backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2">
                <Link href="/" className="font-space text-xl font-bold tracking-widest text-[#7531f3] hover:opacity-80 transition-opacity">
                    X/LAB
                </Link>
            </div>

            <nav className="flex items-center gap-6">
                {/* Add navigation items here if needed later */}
            </nav>
        </header>
    );
}
