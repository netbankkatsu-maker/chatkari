import sharp from "sharp";

export async function cropGenitalCloseup(imageUrl: string) {
  let buffer: Buffer;
  const dataMatch = /^data:image\/[a-z]+;base64,(.+)$/.exec(imageUrl);
  if (dataMatch) {
    buffer = Buffer.from(dataMatch[1], "base64");
  } else {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("closeup source missing");
    buffer = Buffer.from(await response.arrayBuffer());
  }
  const image = sharp(buffer);
  const { width = 512, height = 768 } = await image.metadata();
  const cropped = await image
    .extract({
      left: Math.round(width * 0.18),
      top: Math.round(height * 0.28),
      width: Math.round(width * 0.64),
      height: Math.round(height * 0.5),
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${cropped.toString("base64")}`;
}
