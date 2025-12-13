import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-poppins",
});

export const metadata = {
    title: "TubeLoader | LoveVet Edition",
    description: "Enterprise Media Downloader",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={`${poppins.variable} font-sans min-h-screen flex flex-col items-center justify-center p-4 md:p-8`}>
                <main className="w-full max-w-lg z-10 relative">
                    {children}
                </main>

                <footer className="mt-12 text-[#7531f3]/60 text-xs font-semibold tracking-widest uppercase">
                    Powered by LoveVet Architecture (Next.js)
                </footer>
            </body>
        </html>
    );
}
