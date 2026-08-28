export const STATIC_PROFILE_IMAGES: Record<string, string> = {
  misaki: "/profiles/misaki-v2.webp",
  mayu: "/profiles/mayu-v2.webp",
  ayaka: "/profiles/ayaka-v2.webp",
  rena: "/profiles/rena-v2.webp",
  chinatsu: "/profiles/chinatsu-v2.webp",
  saori: "/profiles/saori-v2.webp",
  yui: "/profiles/yui-v2.webp",
  mai: "/profiles/mai-v2.webp",
  kaori: "https://files-cdn.x.ai/AFUq4N9iR1Siuw94tukEVA/file_0b440c06-57da-4101-9cac-3a303cb0c915.jpg",
  nanako: "https://files-cdn.x.ai/2cybxZ7TS_CnbYukIg9vfg/file_a38ad3b3-4b30-41e8-8164-34a25609198f.jpg",
  rika: "/profiles/rika-v2.webp",
  yukie: "/profiles/yukie.png",
};

export const PROFILE_IMAGE_VERSION = "distinct-v2";

export function profileImageFor(characterId: string) {
  return STATIC_PROFILE_IMAGES[characterId];
}
