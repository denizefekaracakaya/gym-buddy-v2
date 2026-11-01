import React, { useRef } from 'react';
import { isNative, pickImageNative, resizeToJpeg, ImagePickCancelled, type PickedImage } from '../../services/native';

interface Props {
    onPicked: (image: PickedImage) => void;
    onError: (message: string) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
    ariaLabel?: string;
}

/**
 * Camera / gallery picker. Android: native chooser (@capacitor/camera).
 * Web: file input. Either way the image is downscaled to ≤1280 px JPEG before upload.
 */
const ImagePickerButton: React.FC<Props> = ({ onPicked, onError, disabled, className, children, ariaLabel }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = async () => {
        if (!isNative) {
            inputRef.current?.click();
            return;
        }
        try {
            onPicked(await pickImageNative());
        } catch (e) {
            if (e instanceof ImagePickCancelled) return;
            onError(e instanceof Error ? e.message : 'Fotoğraf alınamadı.');
        }
    };

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            onPicked(await resizeToJpeg(file));
        } catch (e) {
            onError(e instanceof Error ? e.message : 'Fotoğraf okunamadı.');
        }
    };

    return (
        <>
            {!isNative && (
                <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            )}
            <button type="button" onClick={handleClick} disabled={disabled} className={className} aria-label={ariaLabel}>
                {children}
            </button>
        </>
    );
};

export default ImagePickerButton;
