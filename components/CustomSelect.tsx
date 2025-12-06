import React, { useState, useRef, useEffect } from 'react';

interface CustomSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
}

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 292.4 292.4" fill="#ee2536">
    <path d="M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z"/>
  </svg>
);

const CustomSelect: React.FC<CustomSelectProps> = ({ 
  options, 
  value, 
  onChange, 
  placeholder = "Selecione", 
  searchable = false,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchable && value && !isOpen) {
        setSearchTerm(value);
    } else if (!value && !isOpen) {
        setSearchTerm('');
    }
  }, [value, searchable, isOpen]);

  const filteredOptions = searchable 
    ? options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  const handleSelect = (option: string) => {
    onChange(option);
    if (searchable) setSearchTerm(option);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full text-left font-sans" ref={wrapperRef}>
      {/* Trigger Area */}
      <div 
        className={`w-full p-[12px] mt-[5px] border rounded-[12px] text-[14px] bg-[#f0f2f5] shadow-sm flex items-center justify-between transition-all duration-300 ${disabled ? 'opacity-60 cursor-not-allowed border-[#e2e8f0]' : 'cursor-pointer border-[#cbd5e1] hover:border-[#94a3b8]'} ${isOpen ? 'border-[#ee2536] ring-1 ring-[#ee2536] ring-opacity-30' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {searchable ? (
          <input 
            type="text"
            value={isOpen ? searchTerm : (value || '')}
            onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
                onChange(e.target.value); 
            }}
            placeholder={placeholder}
            className={`bg-transparent border-none outline-none w-full text-[#333] placeholder-black font-medium`}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()} 
            onFocus={() => setIsOpen(true)}
          />
        ) : (
          <span className={`flex-1 text-left font-medium ${value ? 'text-[#333]' : 'text-black'}`}>
            {value || placeholder}
          </span>
        )}
        
        <div className={`ml-2 flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown />
        </div>
      </div>

      {/* Dropdown Menu - Made clearer with shadow-xl and gray border */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-gray-300 rounded-[12px] shadow-xl max-h-[220px] overflow-y-auto animate-fadeIn custom-scrollbar">
            {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => (
                    <div 
                        key={index}
                        className={`p-[12px_15px] text-left text-[14px] text-[#333] hover:bg-[#fff0f1] hover:text-[#ee2536] cursor-pointer transition-colors border-b border-gray-100 last:border-none ${option === value ? 'bg-[#fff0f1] font-bold text-[#ee2536]' : ''}`}
                        onClick={() => handleSelect(option)}
                    >
                        {option}
                    </div>
                ))
            ) : (
                <div className="p-[15px] text-center text-[#999] text-[13px] italic">
                    Nenhum resultado
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;