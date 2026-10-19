import logging
import io
import logging
import urllib.request
from pathlib import Path
from typing import List, Dict, Tuple
from PIL import Image


TAJIK_STUDENTS: List[Tuple[str, str, str, str]] = [
    ("Somoni", "Rahmonov", "somoni.rahmonov@gmail.com", "+992901110001"),
    ("Anoshirvon", "Rustamov", "anoshirvon.rustamov@gmail.com", "+992901110002"),
    ("Farhod", "Ziyoyev", "farhod.ziyoyev@gmail.com", "+992901110003"),
    ("Nigora", "Nabiyeva", "nigora.nabiyeva@gmail.com", "+992901110004"),
    ("Malika", "Olimova", "malika.olimova@gmail.com", "+992901110005"),
    ("Shahrom", "Hakimov", "shahrom.hakimov@gmail.com", "+992901110006"),
    ("Tahmina", "Qodirova", "tahmina.qodirova@gmail.com", "+992901110007"),
    ("Sherzod", "Toshev", "sherzod.toshev@gmail.com", "+992901110008"),

    ("Parviz", "Ismoilov", "parviz.ismoilov@gmail.com", "+992902220001"),
    ("Zarina", "Alimova", "zarina.alimova@gmail.com", "+992902220002"),
    ("Dilshod", "Safarov", "dilshod.safarov@gmail.com", "+992902220003"),
    ("Bahrom", "Karimov", "bahrom.karimov@gmail.com", "+992902220004"),
    ("Jamshed", "Mirzoev", "jamshed.mirzoev@gmail.com", "+992902220005"),
    ("Madina", "Shodiyeva", "madina.shodiyeva@gmail.com", "+992902220006"),
    ("Gulnora", "Asadova", "gulnora.asadova@gmail.com", "+992902220007"),
    ("Sukhrob", "Umarov", "sukhrob.umarov@gmail.com", "+992902220008"),

    ("Alisher", "Sharipov", "alisher.sharipov@gmail.com", "+992903330001"),
    ("Khujand", "Kholov", "khujand.kholov@gmail.com", "+992903330002"),
    ("Umed", "Boboev", "umed.boboev@gmail.com", "+992903330003"),
    ("Azam", "Samadov", "azam.samadov@gmail.com", "+992903330004"),
    ("Rustam", "Qodirov", "rustam.qodirov@gmail.com", "+992903330005"),
    ("Parvina", "Sobirova", "parvina.sobirova@gmail.com", "+992903330006"),
    ("Nilufar", "Saidova", "nilufar.saidova@gmail.com", "+992903330007"),
    ("Shabnam", "Toshpulotova", "shabnam.toshpulotova@gmail.com", "+992903330008"),

    ("Shahnoza", "Mansurova", "shahnoza.mansurova@gmail.com", "+992904440001"),
    ("Munira", "Rasulova", "munira.rasulova@gmail.com", "+992904440002"),
    ("Manizha", "Davlatova", "manizha.davlatova@gmail.com", "+992904440003"),
    ("Nozima", "Yusupova", "nozima.yusupova@gmail.com", "+992904440004"),
    ("Davron", "Nabiev", "davron.nabiev@gmail.com", "+992904440005"),
    ("Siyovush", "Qosimov", "siyovush.qosimov@gmail.com", "+992904440006"),
    ("Mehrangiz", "Hamidova", "mehrangiz.hamidova@gmail.com", "+992904440007"),
    ("Zarrina", "Boboyeva", "zarrina.boboyeva@gmail.com", "+992904440008"),
]


COURSE_PHOTO_URLS: Dict[int, List[str]] = {
    1: ["https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80", "https://picsum.photos/id/1025/800/400"],
    2: ["https://images.unsplash.com/photo-1527866959252-deab85ef7d1b?w=800&q=80", "https://picsum.photos/id/24/800/400"],
    3: ["https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80", "https://picsum.photos/id/60/800/400"],
    4: ["https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80", "https://picsum.photos/id/180/800/400"]
}


MENTOR_PHOTO_URLS: Dict[str, List[str]] = {
    "sukhrob.hakimov@imkon.tj": ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80", "https://picsum.photos/id/1005/400/400"],
    "gulnora.saidova@imkon.tj": ["https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80", "https://picsum.photos/id/1027/400/400"],
    "farhod.ziyoyev@imkon.tj": ["https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80", "https://picsum.photos/id/64/400/400"]
}


logger: logging.Logger = logging.getLogger(__name__)

def get_or_download_real_photo(remote_urls: List[str]) -> bytes:
    for url in remote_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                return response.read()
        except Exception as exc:
            logger.warning(f"Failed to download image from {url}: {exc}")
            continue

    img = Image.new("RGB", (600, 400), color=(50, 80, 120))
    out = io.BytesIO()
    img.save(out, format="JPEG")
    return out.getvalue()


def save_course_photo(course_id: int, image_bytes: bytes, storage_root: Path) -> str:
    target_dir: Path = storage_root / "course" / str(course_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename: str = "course_image.jpg"
    file_path: Path = target_dir / filename

    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(file_path, format="JPEG", quality=92)
    return f"/storage/course/{course_id}/{filename}"


def save_mentor_avatar(user_id: int, image_bytes: bytes, storage_root: Path) -> Tuple[str, str]:
    target_dir: Path = storage_root / "avatar" / str(user_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")

    avatar_filename: str = "avatar.jpg"
    avatar_path: Path = target_dir / avatar_filename
    img.save(avatar_path, format="JPEG", quality=92)

    thumb_img = img.copy()
    thumb_img.thumbnail((200, 200))
    thumb_filename: str = "avatar_thumb.jpg"
    thumb_path: Path = target_dir / thumb_filename
    thumb_img.save(thumb_path, format="JPEG", quality=90)

    return f"/storage/avatar/{user_id}/{avatar_filename}", f"/storage/avatar/{user_id}/{thumb_filename}"


def stage_downloadable_assets() -> Dict[str, bytes]:
    staged_assets: Dict[str, bytes] = {
        f"mentor:{mentor_email}": get_or_download_real_photo(remote_urls)
        for mentor_email, remote_urls in MENTOR_PHOTO_URLS.items()
    }
    staged_assets.update({
        f"course:{course_id}": get_or_download_real_photo(remote_urls)
        for course_id, remote_urls in COURSE_PHOTO_URLS.items()
    })
    return staged_assets
