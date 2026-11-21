import { isAcceptedImage } from "./imageTypes";

export class CoverUrlError extends Error {}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const FALLBACK_NAME = "cover";
const COPY_AND_PASTE_HINT = "Open the image, copy it, and press Ctrl+V here instead.";

export function parseImageUrl(text: string): URL {
  const url = toUrl(text.trim());
  if (url.protocol !== "https:") throw new CoverUrlError("Only links that start with https:// work.");
  return url;
}

export async function fetchCoverImage(url: URL, fetchImage: typeof fetch = fetch): Promise<File> {
  const response = await request(url, fetchImage);
  if (!response.ok) throw new CoverUrlError(`The website answered with an error (${response.status}).`);
  const image = new File([await response.blob()], fileNameOf(url), { type: response.headers.get("content-type")?.split(";")[0]?.trim() ?? "" });
  if (!isAcceptedImage(image)) throw new CoverUrlError("This link is not a PNG, JPG or WebP image. It may point to a web page instead of the image itself.");
  if (image.size > MAX_IMAGE_BYTES) throw new CoverUrlError("This image is larger than 25 MB.");
  return image;
}

export function firstUriFromDrop(uriList: string): string | null {
  const lines = uriList.split(/\r?\n/).map((line) => line.trim());
  return lines.find((line) => line !== "" && !line.startsWith("#")) ?? null;
}

function toUrl(text: string): URL {
  try {
    return new URL(text);
  } catch {
    throw new CoverUrlError("Enter the full link to an image, starting with https://.");
  }
}

async function request(url: URL, fetchImage: typeof fetch): Promise<Response> {
  try {
    return await fetchImage(url, { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    // A blocked cross-origin request and a network failure look identical to the page.
    throw new CoverUrlError(`The image could not be loaded. The website may not allow other pages to use its images. ${COPY_AND_PASTE_HINT}`);
  }
}

function fileNameOf(url: URL): string {
  return url.pathname.split("/").pop() || FALLBACK_NAME;
}
