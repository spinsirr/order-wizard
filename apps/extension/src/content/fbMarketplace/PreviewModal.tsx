import { useState } from 'react';
import type { FBListingData, FBCondition, FBCategory } from '@/types';
import {
  FBCondition as FBConditionValues,
  FBCategory as FBCategoryValues,
  FB_CONDITION_LABELS,
  FB_CATEGORY_LABELS,
} from '@/types';

interface PreviewModalProps {
  listing: FBListingData;
  onConfirm: (listing: FBListingData) => void;
  onCancel: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999999,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  width: '600px',
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: '#111827',
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: '24px',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '20px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  color: '#374151',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: '#fff',
  cursor: 'pointer',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical' as const,
};

const priceRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-end',
};

const originalPriceStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  marginBottom: '12px',
};

const imageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '12px',
};

const imageContainerStyle = (isSelected: boolean): React.CSSProperties => ({
  position: 'relative',
  aspectRatio: '1',
  borderRadius: '8px',
  overflow: 'hidden',
  cursor: 'pointer',
  border: isSelected ? '3px solid #1877F2' : '3px solid transparent',
  opacity: isSelected ? 1 : 0.5,
  transition: 'all 0.2s',
});

const imageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const checkmarkStyle: React.CSSProperties = {
  position: 'absolute',
  top: '6px',
  right: '6px',
  width: '24px',
  height: '24px',
  backgroundColor: '#1877F2',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
};

const buttonBaseStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 500,
  borderRadius: '6px',
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.2s',
};

const cancelButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#f3f4f6',
  color: '#374151',
};

const confirmButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#1877F2',
  color: '#fff',
};

export function PreviewModal({ listing, onConfirm, onCancel }: PreviewModalProps) {
  const [title, setTitle] = useState(listing.title);
  const [price, setPrice] = useState(listing.price);
  const [condition, setCondition] = useState<FBCondition>(listing.condition);
  const [category, setCategory] = useState<FBCategory>(listing.category);
  const [description, setDescription] = useState(listing.description);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(
    new Set(listing.images)
  );

  const handleImageToggle = (imageUrl: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(imageUrl)) {
        next.delete(imageUrl);
      } else {
        next.add(imageUrl);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const updatedListing: FBListingData = {
      ...listing,
      title,
      price,
      condition,
      category,
      description,
      images: listing.images.filter((img) => selectedImages.has(img)),
    };
    onConfirm(updatedListing);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h2 style={headerTitleStyle}>Preview Listing</h2>
        </div>

        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={priceRowStyle}>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>Price</label>
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={originalPriceStyle}>
            Original price: ${listing.originalPrice}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as FBCondition)}
                style={selectStyle}
              >
                {Object.values(FBConditionValues).map((value) => (
                  <option key={value} value={value}>
                    {FB_CONDITION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FBCategory)}
                style={selectStyle}
              >
                {Object.values(FBCategoryValues).map((value) => (
                  <option key={value} value={value}>
                    {FB_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={textareaStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>
              Images ({selectedImages.size} selected - click to toggle)
            </label>
            <div style={imageGridStyle}>
              {listing.images.map((imageUrl, index) => {
                const isSelected = selectedImages.has(imageUrl);
                return (
                  <div
                    key={index}
                    style={imageContainerStyle(isSelected)}
                    onClick={() => handleImageToggle(imageUrl)}
                  >
                    <img src={imageUrl} alt={`Image ${index + 1}`} style={imageStyle} />
                    {isSelected && <div style={checkmarkStyle}>✓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button
            style={cancelButtonStyle}
            onClick={onCancel}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
            }}
          >
            Cancel
          </button>
          <button
            style={confirmButtonStyle}
            onClick={handleConfirm}
            disabled={selectedImages.size === 0}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#166FE5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1877F2';
            }}
          >
            Add to Queue
          </button>
        </div>
      </div>
    </div>
  );
}
