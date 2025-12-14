import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-poppins",
});

export const metadata = {
    title: "MediaLoader By X/LAB",
    description: "Enterprise Media Downloader",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${poppins.variable} font-sans min-h-screen flex flex-col items-center justify-center p-4 md:p-8`}>
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
