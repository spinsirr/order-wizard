import { useEffect, useState } from 'react';
import { getTemplate, saveTemplate } from '@/lib';
import {
  DEFAULT_TEMPLATE,
  FB_CONDITION_LABELS,
  FB_CATEGORY_LABELS,
  PRICE_ROUNDING_LABELS,
  type FBCondition,
  type FBCategory,
  type PriceRounding,
  type FBListingTemplate,
} from '@/types';

export function Options() {
  const [template, setTemplate] = useState<FBListingTemplate>(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTemplate().then((t) => {
      setTemplate(t);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await saveTemplate(template);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Amazon Order Wizard Settings
        </h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">
            Facebook Marketplace Listing Template
          </h2>

          {/* Discount Percent */}
          <div>
            <label
              htmlFor="discountPercent"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Selling Price (% of original): {template.discountPercent}%
            </label>
            <input
              type="range"
              id="discountPercent"
              min="10"
              max="100"
              step="5"
              value={template.discountPercent}
              onChange={(e) =>
                setTemplate({ ...template, discountPercent: Number(e.target.value) })
              }
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Price Rounding */}
          <div>
            <label
              htmlFor="priceRounding"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Price Rounding
            </label>
            <select
              id="priceRounding"
              value={template.priceRounding}
              onChange={(e) =>
                setTemplate({ ...template, priceRounding: e.target.value as PriceRounding })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(PRICE_ROUNDING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label
              htmlFor="condition"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Default Condition
            </label>
            <select
              id="condition"
              value={template.condition}
              onChange={(e) =>
                setTemplate({ ...template, condition: e.target.value as FBCondition })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(FB_CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Default Category
            </label>
            <select
              id="category"
              value={template.category}
              onChange={(e) =>
                setTemplate({ ...template, category: e.target.value as FBCategory })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(FB_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Pickup Location */}
          <div>
            <label
              htmlFor="pickupLocation"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Pickup Location
            </label>
            <input
              type="text"
              id="pickupLocation"
              value={template.pickupLocation}
              onChange={(e) =>
                setTemplate({ ...template, pickupLocation: e.target.value })
              }
              placeholder="e.g., Downtown Seattle"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Include Order Link */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeOrderLink"
              checked={template.includeOrderLink}
              onChange={(e) =>
                setTemplate({ ...template, includeOrderLink: e.target.checked })
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="includeOrderLink" className="text-sm text-gray-700">
              Include Amazon order link in description
            </label>
          </div>

          {/* Description Template */}
          <div>
            <label
              htmlFor="descriptionTemplate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description Template
            </label>
            <textarea
              id="descriptionTemplate"
              value={template.descriptionTemplate}
              onChange={(e) =>
                setTemplate({ ...template, descriptionTemplate: e.target.value })
              }
              rows={8}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Available placeholders: {'{productName}'}, {'{productDescription}'},{' '}
              {'{originalPrice}'}, {'{sellingPrice}'}, {'{orderDate}'}, {'{condition}'}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Save Settings
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Reset to Default
            </button>
            {saved && (
              <span className="text-green-600 text-sm font-medium">Saved!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
