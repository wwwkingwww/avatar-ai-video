import type { UploadedFile } from '../types';

interface FileUploaderProps {
  files: UploadedFile[];
  onUpload: (file: File) => void;
  disabled: boolean;
}

const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

export function FileUploader({ files }: FileUploaderProps) {
  if (files.length === 0) return null;
  return (
    <div className="file-previews">
      {files.map((f, i) => (
        <div key={i} className="file-preview">
          {isImage(f.name) ? (
            <img src={f.url} alt={f.name} />
          ) : (
            <div className="file-icon">📄</div>
          )}
        </div>
      ))}
    </div>
  );
}
