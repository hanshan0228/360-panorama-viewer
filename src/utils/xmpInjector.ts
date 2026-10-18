/**
 * Client-Side Google PhotoSphere XMP Metadata Injector
 * Embeds standard GPano XMP tags into JPEG files so they are natively recognized
 * by Facebook, Google Photos, Apple Vision Pro, Meta Quest, and 360° VR viewers.
 */

export function buildPhotoSphereXmpXml(width: number, height: number): string {
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" rdf:about="">
      <GPano:UsePanoramaViewer>True</GPano:UsePanoramaViewer>
      <GPano:CaptureSoftware>360 Panorama Viewer</GPano:CaptureSoftware>
      <GPano:StitchingSoftware>360 Panorama Viewer 360 VR Pipeline</GPano:StitchingSoftware>
      <GPano:ProjectionType>equirectangular</GPano:ProjectionType>
      <GPano:PoseHeadingDegrees>0.0</GPano:PoseHeadingDegrees>
      <GPano:PosePitchDegrees>0.0</GPano:PosePitchDegrees>
      <GPano:PoseRollDegrees>0.0</GPano:PoseRollDegrees>
      <GPano:InitialViewHeadingDegrees>0</GPano:InitialViewHeadingDegrees>
      <GPano:InitialViewPitchDegrees>0</GPano:InitialViewPitchDegrees>
      <GPano:InitialHorizontalFOVDegrees>75.0</GPano:InitialHorizontalFOVDegrees>
      <GPano:CroppedAreaImageWidthPixels>${width}</GPano:CroppedAreaImageWidthPixels>
      <GPano:CroppedAreaImageHeightPixels>${height}</GPano:CroppedAreaImageHeightPixels>
      <GPano:FullPanoWidthPixels>${width}</GPano:FullPanoWidthPixels>
      <GPano:FullPanoHeightPixels>${height}</GPano:FullPanoHeightPixels>
      <GPano:CroppedAreaLeftPixels>0</GPano:CroppedAreaLeftPixels>
      <GPano:CroppedAreaTopPixels>0</GPano:CroppedAreaTopPixels>
      <GPano:SourcePhotosCount>1</GPano:SourcePhotosCount>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
}

/**
 * Injects Google PhotoSphere XMP APP1 packet into a JPEG ArrayBuffer
 */
export function injectPhotoSphereXmp(jpegBuffer: ArrayBuffer, width: number, height: number): Blob {
  const bytes = new Uint8Array(jpegBuffer);

  // Validate JPEG SOI marker (0xFF, 0xD8)
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return new Blob([jpegBuffer], { type: 'image/jpeg' });
  }

  const xmpXml = buildPhotoSphereXmpXml(width, height);
  const xmpHeader = 'http://ns.adobe.com/xap/1.0/\0';
  const encoder = new TextEncoder();
  const xmpHeaderBytes = encoder.encode(xmpHeader);
  const xmpXmlBytes = encoder.encode(xmpXml);

  // APP1 payload: identifier (29 bytes) + XMP XML
  const payloadLength = xmpHeaderBytes.length + xmpXmlBytes.length;
  const markerLength = payloadLength + 2; // includes the 2-byte length field

  if (markerLength > 65535) {
    // Falls beyond single segment limit, return uncompressed
    return new Blob([jpegBuffer], { type: 'image/jpeg' });
  }

  // Construct APP1 segment
  const app1Segment = new Uint8Array(4 + payloadLength);
  app1Segment[0] = 0xff;
  app1Segment[1] = 0xe1;
  app1Segment[2] = (markerLength >> 8) & 0xff;
  app1Segment[3] = markerLength & 0xff;
  app1Segment.set(xmpHeaderBytes, 4);
  app1Segment.set(xmpXmlBytes, 4 + xmpHeaderBytes.length);

  // Find insertion point: directly after SOI (0xFF 0xD8), or after existing APP0 (JFIF)
  let insertIndex = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) {
    const app0Length = (bytes[4] << 8) | bytes[5];
    insertIndex = 4 + app0Length;
  }

  const parts: BlobPart[] = [bytes.subarray(0, insertIndex), app1Segment];
  let preservedStart = insertIndex;
  let cursor = insertIndex;
  while (cursor + 1 < bytes.length && bytes[cursor] === 0xff) {
    let markerIndex = cursor + 1;
    while (bytes[markerIndex] === 0xff) markerIndex++;
    const marker = bytes[markerIndex];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      cursor = markerIndex + 1;
      continue;
    }
    const length = (bytes[markerIndex + 1] << 8) | bytes[markerIndex + 2];
    const end = markerIndex + 1 + length;
    if (length < 2 || end > bytes.length) throw new Error('Invalid JPEG segment');
    const payloadStart = markerIndex + 3;
    if (marker === 0xe1 && end - payloadStart >= xmpHeaderBytes.length
      && xmpHeaderBytes.every((value, index) => bytes[payloadStart + index] === value)) {
      parts.push(bytes.subarray(preservedStart, cursor));
      preservedStart = end;
    }
    cursor = end;
  }
  parts.push(bytes.subarray(preservedStart));
  return new Blob(parts, { type: 'image/jpeg' });
}

/**
 * Converts a 2:1 canvas to a VR-ready JPEG Blob with embedded Google PhotoSphere XMP metadata
 */
export async function exportVrReadyJpegBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        try {
          if (!blob) throw new Error('JPEG encoding failed');
          const buffer = await blob.arrayBuffer();
          resolve(injectPhotoSphereXmp(buffer, canvas.width, canvas.height));
        } catch (error) {
          reject(error);
        }
      },
      'image/jpeg',
      quality
    );
  });
}

export async function exportPhotoSphereFile(file: File, previewUrl: string): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      image.onload = image.onerror = null;
      resolve(image);
    };
    image.onerror = () => {
      image.onload = image.onerror = null;
      reject(new Error('Image decoding failed'));
    };
    image.src = previewUrl;
  });
  if (file.type === 'image/jpeg' || (!file.type && /\.jpe?g$/i.test(file.name))) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG');
    return injectPhotoSphereXmp(buffer, image.naturalWidth, image.naturalHeight);
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0);
  return exportVrReadyJpegBlob(canvas);
}
