import React from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
  message: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible, message }) => {
  if (!isVisible) return null;

  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/95 z-50 flex flex-col justify-center items-center rounded-[20px] animate-fadeIn">
      <div className="w-[40px] h-[40px] border-4 border-[#f3f3f3] border-t-[#ee2f24] rounded-full animate-spin mb-[10px]"></div>
      <div className="text-[#ee2f24] font-bold text-base">{message}</div>
    </div>
  );
};

export default LoadingOverlay;