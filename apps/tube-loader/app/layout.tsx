import { Poppins, Space_Grotesk } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-poppins",
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-space-grotesk",
});

export const metadata = {
    title: "X/LAB",
    description: "Media Downloader",
};

import { Navbar } from '@x-lab/ui';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${poppins.variable} ${spaceGrotesk.variable} font-sans min-h-screen flex flex-col items-center justify-center p-4 md:p-8 pt-24`}>
                <Navbar />
                <main className="w-full max-w-2xl z-10 relative">
                    {children}
                </main>

                <footer className="mt-12 text-[#7531f3]/60 text-xs font-semibold tracking-widest uppercase">
                    Powered by X/LAB
                </footer>
            </body>
        </html>
    );
}
