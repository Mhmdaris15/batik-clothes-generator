import { cookies } from "next/headers";
import { isSupportedLang, type Lang } from "@/lib/i18n-dictionary";

const LANG_COOKIE = "batik_lang";

export async function getServerLang(): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LANG_COOKIE)?.value;
  if (isSupportedLang(value)) {
    return value;
  }
  return "en";
}
