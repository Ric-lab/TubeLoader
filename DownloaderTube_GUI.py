import tkinter as tk
from tkinter import ttk, messagebox
import yt_dlp
import os
import re
import threading
import subprocess
import shutil
from pathlib import Path
import unicodedata
import uuid

# Constantes e configurações
# Constants and configurations
DEFAULT_URL = "Insira a URL do YouTube aqui"
STATUS_TEXT_INITIAL = "Aguardando..."

class DownloaderApp(tk.Tk):
    """
    Aplicativo GUI para baixar vídeos e áudios do YouTube.
    GUI application to download YouTube videos and audios.
    """
    def __init__(self):
        super().__init__()

        # Variáveis de instância
        # Instance variables
        self.download_folder = Path.home() / "Downloads"
        self.ff_path = self.find_ffmpeg_and_ffprobe()
        self.active_downloads = 0

        self.title("TubeLoader")
        self.geometry("600x400")
        self.style = ttk.Style(self)
        self.style.theme_use('clam')  # Estilo mais moderno
        self.configure(bg="#2c3e50")

        # Tenta carregar o ícone se existir
        # Tries to load the icon if it exists
        try:
            self.iconbitmap("tubeloader.ico")
        except tk.TclError:
            pass  # Ignora se o ícone não for encontrado

        self.create_widgets()
        
    def find_ffmpeg_and_ffprobe(self):
        """
        Encontra os executáveis do FFmpeg e FFprobe na hierarquia especificada.
        Finds the FFmpeg and FFprobe executables in the specified hierarchy.
        """
        possible_paths = [
            Path(os.getcwd()) / "ffmpeg" / "ffmpeg.exe",
            Path(os.getcwd()) / "ffmpeg.exe",
            shutil.which("ffmpeg"),
            Path("C:/ffmpeg/bin/ffmpeg.exe"),
        ]
        
        found_ffmpeg = None
        for path in possible_paths:
            if path and Path(path).exists():
                found_ffmpeg = str(path)
                break
        
        found_ffprobe = None
        probe_path = None
        if found_ffmpeg:
            # Assumindo que ffprobe está no mesmo diretório ou em ./ffprobe
            # Assuming ffprobe is in the same directory or in ./ffprobe
            probe_path = Path(found_ffmpeg).parent / "ffprobe.exe"
            if not probe_path.exists():
                probe_path = Path(os.getcwd()) / "ffprobe" / "ffprobe.exe"
            
            if probe_path.exists():
                found_ffprobe = str(probe_path)

        if not found_ffmpeg or not found_ffprobe:
            messagebox.showerror(
                "Erro Crítico",
                "FFmpeg e/ou FFprobe não encontrados. Verifique a hierarquia de pastas ou se estão no PATH do sistema."
            )
            self.quit()
            return None
        
        return {"ffmpeg": found_ffmpeg, "ffprobe": found_ffprobe}

    def create_widgets(self):
        """
        Cria e organiza todos os widgets da GUI.
        Creates and organizes all the GUI widgets.
        """
        # Estilo de fontes e cores
        # Font and color styles
        main_bg = "#34495e"
        frame_bg = "#4a6c8e"
        btn_bg = "#3498db"
        btn_fg = "white"
        label_fg = "white"
        status_fg = "#2ecc71"

        self.style.configure("TFrame", background=main_bg)
        self.style.configure("TLabel", background=main_bg, foreground=label_fg, font=("Inter", 10))
        self.style.configure("TButton", background=btn_bg, foreground=btn_fg, font=("Inter", 10, "bold"), borderwidth=0)
        self.style.map("TButton", background=[("active", "#2980b9")])
        self.style.configure("TEntry", font=("Inter", 10))
        self.style.configure("TRadiobutton", background=main_bg, foreground=label_fg, font=("Inter", 10))
        self.style.configure("Status.TLabel", background=main_bg, foreground=status_fg, font=("Inter", 10, "bold"))
        
        main_frame = ttk.Frame(self, padding="20 10")
        main_frame.pack(fill="both", expand=True)

        # Campo de URL
        # URL field
        ttk.Label(main_frame, text="URL do YouTube:").grid(row=0, column=0, sticky="W", pady=(0, 5))
        self.url_entry = ttk.Entry(main_frame, width=50)
        self.url_entry.grid(row=1, column=0, columnspan=2, sticky="EW", pady=(0, 10))
        self.url_entry.insert(0, DEFAULT_URL)
        self.url_entry.bind("<FocusIn>", self.on_focus_in_url)
        self.url_entry.bind("<FocusOut>", self.on_focus_out_url)

        # Seleção de Formato
        # Format selection
        format_frame = ttk.Frame(main_frame, padding=10, relief="groove")
        format_frame.grid(row=2, column=0, columnspan=2, sticky="EW", pady=(0, 10))
        format_frame.configure(style="TFrame")
        ttk.Label(format_frame, text="Formato:", background=frame_bg, foreground=label_fg).grid(row=0, column=0, sticky="W", padx=(0,10))
        
        self.format_var = tk.StringVar(value="mp4")
        ttk.Radiobutton(format_frame, text="Vídeo MP4 (melhor qualidade)", variable=self.format_var, value="mp4").grid(row=0, column=1, sticky="W")
        ttk.Radiobutton(format_frame, text="Áudio MP3 (320 kbps)", variable=self.format_var, value="mp3").grid(row=0, column=2, sticky="W")
        format_frame.columnconfigure(0, weight=1)

        # Área de Corte
        # Cutting area
        cut_frame = ttk.Frame(main_frame, padding=10, relief="groove")
        cut_frame.grid(row=3, column=0, columnspan=2, sticky="EW", pady=(0, 10))
        cut_frame.configure(style="TFrame")
        ttk.Label(cut_frame, text="Corte (opcional):", background=frame_bg, foreground=label_fg).grid(row=0, column=0, sticky="W", padx=(0,10))
        
        ttk.Label(cut_frame, text="Início (HH:MM:SS):", background=frame_bg, foreground=label_fg).grid(row=1, column=0, sticky="W", pady=5)
        self.start_entry = ttk.Entry(cut_frame)
        self.start_entry.grid(row=1, column=1, sticky="EW")

        ttk.Label(cut_frame, text="Fim (HH:MM:SS):", background=frame_bg, foreground=label_fg).grid(row=2, column=0, sticky="W", pady=5)
        self.end_entry = ttk.Entry(cut_frame)
        self.end_entry.grid(row=2, column=1, sticky="EW")
        
        cut_frame.columnconfigure(1, weight=1)

        # Destino
        # Destination
        ttk.Label(main_frame, text=f"Destino: sempre sua pasta Downloads").grid(row=4, column=0, columnspan=2, sticky="W", pady=(0, 10))

        # Botões
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=5, column=0, columnspan=2, sticky="EW")
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)

        self.download_btn = ttk.Button(button_frame, text="Baixar", command=self.on_download_click)
        self.download_btn.grid(row=0, column=0, sticky="EW", padx=(0, 5))
        
        self.open_btn = ttk.Button(button_frame, text="Abrir Downloads", command=self.open_downloads_folder)
        self.open_btn.grid(row=0, column=1, sticky="EW", padx=(5, 0))

        # Barra de status
        # Status bar
        self.status_label = ttk.Label(main_frame, text=STATUS_TEXT_INITIAL, anchor="w", style="Status.TLabel")
        self.status_label.grid(row=6, column=0, columnspan=2, sticky="EW", pady=(10, 0))

        # Configurações de layout
        # Layout configurations
        main_frame.columnconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)

    def on_focus_in_url(self, event):
        """Limpa o texto padrão ao focar no campo de URL."""
        if self.url_entry.get() == DEFAULT_URL:
            self.url_entry.delete(0, tk.END)

    def on_focus_out_url(self, event):
        """Restaura o texto padrão se o campo de URL estiver vazio."""
        if not self.url_entry.get():
            self.url_entry.insert(0, DEFAULT_URL)

    def on_download_click(self):
        """
        Valida a entrada e inicia o download em uma thread separada.
        Validates input and starts the download on a separate thread.
        """
        url = self.url_entry.get()
        start_time = self.start_entry.get().strip()
        end_time = self.end_entry.get().strip()
        media_type = self.format_var.get()

        if not url or url == DEFAULT_URL:
            messagebox.showerror("Erro de URL", "Por favor, insira uma URL válida do YouTube.")
            return

        # Validação do corte
        # Cutting validation
        is_cutting = bool(start_time or end_time)
        if is_cutting and not (start_time and end_time):
            messagebox.showerror("Erro de Corte", "Para cortar, preencha ambos os campos: INÍCIO e FIM em HH:MM:SS.")
            return

        if is_cutting:
            if not self.validate_time_format(start_time) or not self.validate_time_format(end_time):
                messagebox.showerror("Erro de Formato", "Formato de tempo inválido. Use HH:MM:SS.")
                return

        # Desabilita o botão para evitar cliques múltiplos
        # Disables the button to prevent multiple clicks
        self.download_btn.config(state=tk.DISABLED)
        self.active_downloads += 1
        self.update_status(f"Iniciando download ({self.active_downloads} ativo)...")

        # Inicia o download em uma thread para não travar a GUI
        # Starts the download on a thread to not freeze the GUI
        download_thread = threading.Thread(
            target=self.perform_download,
            args=(url, start_time, end_time, media_type)
        )
        download_thread.start()

    def validate_time_format(self, time_str):
        """
        Valida se a string de tempo está no formato HH:MM:SS.
        Validates if the time string is in the HH:MM:SS format.
        """
        return re.match(r"^\d{2}:\d{2}:\d{2}$", time_str) is not None

    def get_sanitized_filename(self, title, extension):
        """
        Gera um nome de arquivo seguro e único, sanitizando o título.
        Generates a safe and unique filename by sanitizing the title.
        """
        # Normaliza a string para remover acentos e outros caracteres especiais
        sanitized_title = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode('utf-8')
        # Remove caracteres inválidos para nome de arquivo no Windows
        sanitized_title = re.sub(r'[\\/:*?"<>|]', '', sanitized_title)
        
        filename = f"{sanitized_title}.{extension}"
        filepath = self.download_folder / filename

        counter = 1
        while filepath.exists():
            filename = f"{sanitized_title} ({counter}).{extension}"
            filepath = self.download_folder / filename
            counter += 1
            
        return filepath

    def update_status(self, message):
        """Atualiza a barra de status na GUI."""
        self.status_label.config(text=message)
        self.update_idletasks()

    def perform_download(self, url, start_time, end_time, media_type):
        """
        Executa o processo de download, conversão e corte.
        Executes the download, conversion and cutting process.
        """
        try:
            # Obtém informações do vídeo para o nome do arquivo final
            # Gets video info for the final filename
            self.update_status("Obtendo informações do vídeo...")
            info_options = {'quiet': True, 'forcetitle': True, 'skip_download': True}
            with yt_dlp.YoutubeDL(info_options) as ydl:
                info_dict = ydl.extract_info(url, download=False)
                video_title = info_dict.get('title', 'video')

            is_cutting = bool(start_time and end_time)

            if media_type == 'mp4':
                temp_video_raw = self.download_folder / f"{uuid.uuid4()}.mp4"
                temp_audio_raw = self.download_folder / f"{uuid.uuid4()}.m4a"
                final_filename = self.get_sanitized_filename(video_title, "mp4")
                self.download_mp4(url, temp_video_raw, temp_audio_raw, final_filename, start_time, end_time, is_cutting)
            elif media_type == 'mp3':
                temp_m4a_filename_raw = self.download_folder / f"{uuid.uuid4()}.m4a"
                final_filename = self.get_sanitized_filename(video_title, "mp3")
                self.download_and_convert_mp3(url, temp_m4a_filename_raw, final_filename, start_time, end_time, is_cutting)

        except yt_dlp.utils.DownloadError as e:
            self.update_status("Erro: Verifique a URL ou a conexão.")
            messagebox.showerror("Erro de Download", f"Ocorreu um erro no download: {e}")
        except Exception as e:
            self.update_status("Erro: Ocorreu um erro inesperado.")
            messagebox.showerror("Erro Inesperado", f"Ocorreu um erro: {e}")
        finally:
            # Reabilita o botão e atualiza o status
            # Re-enables the button and updates the status
            self.active_downloads -= 1
            if self.active_downloads == 0:
                self.download_btn.config(state=tk.NORMAL)
                self.update_status(f"Pronto para um novo download.")
            else:
                self.update_status(f"Concluído. {self.active_downloads} download(s) ativo(s).")
                
    def download_mp4(self, url, temp_video_path, temp_audio_path, final_filename, start_time, end_time, is_cutting):
        """
        Baixa o melhor vídeo e áudio separadamente e os une com FFmpeg.
        Downloads the best video and audio separately and merges them with FFmpeg.
        """
        self.update_status("Baixando vídeo...")
        ydl_opts_video = {
            'outtmpl': str(temp_video_path),
            'format': 'bestvideo',
            'ffmpeg_location': self.ff_path['ffmpeg'],
        }
        with yt_dlp.YoutubeDL(ydl_opts_video) as ydl:
            ydl.download([url])

        self.update_status("Baixando áudio...")
        ydl_opts_audio = {
            'outtmpl': str(temp_audio_path),
            'format': 'bestaudio',
            'ffmpeg_location': self.ff_path['ffmpeg'],
        }
        with yt_dlp.YoutubeDL(ydl_opts_audio) as ydl:
            ydl.download([url])

        self.update_status("Unindo vídeo e áudio...")
        
        # Cria um nome de arquivo temporário para o arquivo unido
        # Creates a temporary filename for the merged file
        merged_temp_path = self.download_folder / f"{uuid.uuid4()}.mp4"

        # Comando para unir áudio e vídeo
        # Command to merge audio and video
        cmd_merge = [
            self.ff_path['ffmpeg'],
            "-i", str(temp_video_path),
            "-i", str(temp_audio_path),
            "-c:v", "copy",
            "-c:a", "aac",
            merged_temp_path
        ]
        subprocess.run(cmd_merge, check=True, creationflags=subprocess.CREATE_NO_WINDOW)

        os.remove(temp_video_path)
        os.remove(temp_audio_path)

        if is_cutting:
            self.update_status("Cortando vídeo...")
            self.cut_with_ffmpeg(str(merged_temp_path), str(final_filename), start_time, end_time, 'video')
            os.remove(merged_temp_path)
            self.update_status(f"Corte MP4 concluído. Salvo em: {final_filename.name}")
        else:
            shutil.move(merged_temp_path, final_filename)
            self.update_status(f"Download MP4 concluído. Salvo em: {final_filename.name}")

    def download_and_convert_mp3(self, url, temp_m4a_filename, final_filename, start_time, end_time, is_cutting):
        """
        Baixa o áudio, o corta (se necessário) e converte para MP3 320 kbps.
        Downloads the audio, cuts it (if necessary), and converts it to MP3 320 kbps.
        """
        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio',
            'outtmpl': str(temp_m4a_filename),
            'ffmpeg_location': self.ff_path['ffmpeg'],
        }
        
        self.update_status("Baixando áudio (M4A)...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        temp_cut_filename = None
        file_to_convert = None
        if is_cutting:
            self.update_status("Cortando áudio M4A...")
            temp_cut_filename = self.download_folder / f"{uuid.uuid4()}.m4a"
            self.cut_with_ffmpeg(str(temp_m4a_filename), str(temp_cut_filename), start_time, end_time, 'audio')
            os.remove(temp_m4a_filename)
            file_to_convert = temp_cut_filename
        else:
            file_to_convert = temp_m4a_filename

        self.update_status("Convertendo para MP3 320 kbps...")
        try:
            # Conversão para MP3 320k
            # Conversion to MP3 320k
            subprocess.run([
                self.ff_path['ffmpeg'],
                "-i", str(file_to_convert),
                "-codec:a", "libmp3lame",
                "-b:a", "320k",
                str(final_filename)
            ], check=True, creationflags=subprocess.CREATE_NO_WINDOW)
            self.update_status(f"Download MP3 concluído. Salvo em: {final_filename.name}")
        finally:
            # Garante que os arquivos temporários sejam apagados
            # Ensures temporary files are deleted
            if os.path.exists(file_to_convert):
                os.remove(file_to_convert)

    def cut_with_ffmpeg(self, input_path, output_path, start, end, media_type):
        """
        Realiza o corte preciso do arquivo usando FFmpeg.
        Performs precise cutting of the file using FFmpeg.
        """
        if media_type == 'video':
            # Comando de corte robusto com re-codificação e ordem de parâmetros correta
            # Robust cutting command with re-encoding and correct parameter order
            cmd = [
                self.ff_path['ffmpeg'],
                "-ss", start,
                "-to", end,
                "-i", input_path,
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "18",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                output_path
            ]
        elif media_type == 'audio':
            cmd = [
                self.ff_path['ffmpeg'],
                "-i", input_path,
                "-ss", start,
                "-to", end,
                "-c", "copy",
                output_path
            ]
        
        subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW)

    def open_downloads_folder(self):
        """
        Abre a pasta Downloads do usuário.
        Opens the user's Downloads folder.
        """
        try:
            os.startfile(self.download_folder)
        except FileNotFoundError:
            messagebox.showerror("Erro", "A pasta Downloads não foi encontrada.")
        except Exception as e:
            messagebox.showerror("Erro", f"Não foi possível abrir a pasta de downloads: {e}")

if __name__ == "__main__":
    app = DownloaderApp()
    app.mainloop()
