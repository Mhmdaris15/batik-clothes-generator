import { removeBackground } from "@imgly/background-removal-node";
import fs from "fs";

async function main() {
  try {
    const inputPath = "public\\girl-photo.png";
    const outputPath = "public\\girl-photo-no-bg.png";

    // read image file and wrap in Blob
    const imageBuffer = fs.readFileSync(inputPath);
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });

    // remove background
    const result = await removeBackground(imageBlob);

    // save output
    fs.writeFileSync(outputPath, Buffer.from(await result.arrayBuffer()));

    console.log("✅ Background removed successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();