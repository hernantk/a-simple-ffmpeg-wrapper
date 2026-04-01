import { ConversionType, getFormatsForType } from "../types";

interface ConversionTypeTabsProps {
  value: ConversionType;
  onChange: (type: ConversionType) => void;
}

export function ConversionTypeTabs({ value, onChange }: ConversionTypeTabsProps) {
  const types: { key: ConversionType; label: string; icon: string }[] = [
    { key: "video", label: "Video", icon: "🎬" },
    { key: "audio", label: "Audio", icon: "🎵" },
    { key: "image", label: "Image", icon: "🖼️" },
  ];

  return (
    <div className="type-tabs">
      {types.map(({ key, label, icon }) => (
        <button
          key={key}
          className={`type-tab ${value === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          <span className="tab-icon">{icon}</span>
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

interface FormatSelectorProps {
  conversionType: ConversionType;
  value: string;
  onChange: (format: string) => void;
}

export function FormatSelector({
  conversionType,
  value,
  onChange,
}: FormatSelectorProps) {
  const formats = getFormatsForType(conversionType);

  return (
    <div className="format-selector">
      <label className="format-label">Output Format</label>
      <select
        className="format-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select format...</option>
        {formats.map((format) => (
          <option key={format} value={format}>
            {format.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
