import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/auth";

// Signed direct-to-Cloudinary upload: the browser uploads the file straight
// to Cloudinary using this signature, so survey plan docs never pass through
// our server. Requires a signed-in user so anonymous visitors can't mint
// upload signatures against our account.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary is not configured" },
      { status: 503 },
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "land-scam-check";

  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
  });
}
