import os
import re
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
except ImportError:
    raise SystemExit("yt-dlp não encontrado. Instale com: pip install yt-dlp")

def sanitize_filename(name: str) -> str:
    # remove caracteres problemáticos em Windows/macOS/Linux
    return re.sub(r'[\\/*?:"<>|]+', "_", name).strip()

def prompt_choice(prompt, choices):
    print(prompt)
    for i, (key, label) in enumerate(choices.items(), 1):
        print(f"  {i}) {label}")
    while True:
        sel = input("Escolha: ").strip()
        # aceita índice numérico ou chave
        if sel.isdigit():
            idx = int(sel) - 1
            if 0 <= idx < len(choices):
                return list(choices.keys())[idx]
        elif sel in choices:
            return sel
        print("Opção inválida. Tente novamente.")

def build_format_string(video_quality: str) -> str:
    """
    Mapeia qualidade desejada para strings de formato do yt-dlp.
    Preferimos MP4 (video=mp4 + audio=m4a) quando possível.
    """
    if video_quality == "1080p":
        return "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]"
    if video_quality == "720p":
        return "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]"
    if video_quality == "best":
        return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]"
    # fallback
    return "bestvideo+bestaudio/best"

def download_mp4(url: str, quality: str, outdir: Path):
    ydl_opts = {
        "format": build_format_string(quality),
        "merge_output_format": "mp4",
        "outtmpl": str(outdir / "%(title).200B_%(id)s.%(ext)s"),
        "noprogress": False,
        "quiet": False,
        "concurrent_fragment_downloads": 4,
        "postprocessors": [
            # garante merge em mp4 quando vier separado (video+audio)
            {"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"},
        ],
    }
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = sanitize_filename(info.get("title", "video"))
        vid = info.get("id", "")
        filepath = outdir / f"{title}_{vid}.mp4"
        # nem sempre o nome final bate 100% com o template (remux); varremos o diretório
        final_path = None
        for p in outdir.glob(f"*{vid}*.mp4"):
            final_path = p
            break
        print("\n✅ Download concluído (MP4).")
        print("Arquivo:", final_path or filepath)

def download_mp3(url: str, bitrate_kbps: str, outdir: Path):
    # yt-dlp usa FFmpegExtractAudio; 'preferredquality' aceita string numérica
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(outdir / "%(title).200B_%(id)s.%(ext)s"),
        "noprogress": False,
        "quiet": False,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": bitrate_kbps,  # "128", "192", "320"
            },
            # normaliza extensão para .mp3
            {"key": "FFmpegMetadata"},
        ],
    }
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = sanitize_filename(info.get("title", "audio"))
        vid = info.get("id", "")
        # procurar arquivo final .mp3
        final_path = None
        for p in outdir.glob(f"*{vid}*.mp3"):
            final_path = p
            break
        print("\n✅ Download concluído (MP3).")
        print("Arquivo:", final_path or outdir / f"{title}_{vid}.mp3")

def main():
    print("=== YouTube Downloader (yt-dlp) ===\n")
    url = input("Cole o link do vídeo do YouTube: ").strip()
    if not url:
        print("Link vazio. Encerrando.")
        return

    outdir_input = input("Pasta de saída (Enter para usar ./downloads): ").strip()
    outdir = Path(outdir_input) if outdir_input else Path("./downloads")
    outdir.mkdir(parents=True, exist_ok=True)

    fmt_choice = prompt_choice(
        "\nEscolha o formato de saída:",
        {"mp4": "Vídeo MP4", "mp3": "Áudio MP3"}
    )

    if fmt_choice == "mp4":
        q_choice = prompt_choice(
            "\nQualidade do vídeo:",
            {"1080p": "MP4 1080p (quando disponível)",
             "720p": "MP4 720p (quando disponível)",
             "best": "Melhor disponível (pode ser >1080p ou cair para o possível)"}
        )
        download_mp4(url, q_choice, outdir)

    else:
        br_choice = prompt_choice(
            "\nQualidade do áudio (MP3):",
            {"128": "128 kbps (menor arquivo)",
             "192": "192 kbps (equilíbrio)",
             "320": "320 kbps (melhor qualidade, maior arquivo)"}
        )
        download_mp3(url, br_choice, outdir)

    print("\n✔️ Finalizado.")

if __name__ == "__main__":
    main()
