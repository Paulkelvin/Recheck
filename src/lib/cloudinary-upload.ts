export async function uploadToCloudinary(file: File): Promise<string> {
  const signRes = await fetch("/api/cloudinary-sign", { method: "POST" });

  if (!signRes.ok) {
    const data = await signRes.json().catch(() => ({}));
    throw new Error(data.error || "Could not get an upload signature");
  }

  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    { method: "POST", body: formData },
  );

  if (!uploadRes.ok) {
    throw new Error("Upload to Cloudinary failed");
  }

  const data = await uploadRes.json();
  return data.secure_url as string;
}
