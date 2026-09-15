import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { getTemplate, saveTemplate } from '@/lib';
import {
  DEFAULT_TEMPLATE,
  FB_CATEGORY_LABELS,
  FB_CONDITION_LABELS,
  type FBCategory,
  type FBCondition,
  type FBListingTemplate,
  PRICE_ROUNDING_LABELS,
  type PriceRounding,
} from '@/types';

export function Options() {
  const [template, setTemplate] = useState<FBListingTemplate>(DEFAULT_TEMPLATE);
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getTemplate()
      .then((nextTemplate) => {
        if (!cancelled) {
          setTemplate(nextTemplate);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(new Error('Could not load listing defaults', { cause }));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      await saveTemplate(template);
      setError(null);
      setSaved(true);
    } catch (cause) {
      setError(new Error('Could not save listing defaults', { cause }));
    }
  };

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-background px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[520px] w-full rounded-xl" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-caption uppercase tracking-[0.12em] text-muted-foreground">
          OrderCue / Settings
        </p>
        <h1 className="mt-2 text-heading font-semibold tracking-tight">Marketplace defaults</h1>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="mt-6 gap-0 shadow-none">
          <CardHeader className="border-b">
            <CardTitle>Facebook Marketplace listing</CardTitle>
            <CardDescription>
              Set the defaults used when OrderCue prepares a listing draft.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="discountPercent">Selling price</Label>
                <span className="font-mono text-caption text-muted-foreground">
                  {template.discountPercent}% of original
                </span>
              </div>
              <Slider
                id="discountPercent"
                min={10}
                max={100}
                step={5}
                value={[template.discountPercent]}
                onValueChange={([value]) => {
                  if (value !== undefined) {
                    setTemplate({ ...template, discountPercent: value });
                  }
                }}
                aria-label="Selling price percentage"
              />
              <div className="flex justify-between font-mono text-caption text-muted-foreground">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priceRounding">Price rounding</Label>
              <Select
                value={template.priceRounding}
                onValueChange={(value) =>
                  setTemplate({ ...template, priceRounding: value as PriceRounding })
                }
              >
                <SelectTrigger id="priceRounding" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRICE_ROUNDING_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="condition">Default condition</Label>
                <Select
                  value={template.condition}
                  onValueChange={(value) =>
                    setTemplate({ ...template, condition: value as FBCondition })
                  }
                >
                  <SelectTrigger id="condition" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FB_CONDITION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Default category</Label>
                <Select
                  value={template.category}
                  onValueChange={(value) =>
                    setTemplate({ ...template, category: value as FBCategory })
                  }
                >
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FB_CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickupLocation">Pickup location</Label>
              <Input
                id="pickupLocation"
                value={template.pickupLocation}
                onChange={(event) =>
                  setTemplate({ ...template, pickupLocation: event.target.value })
                }
                placeholder="e.g., Downtown Seattle"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeOrderLink"
                checked={template.includeOrderLink}
                onCheckedChange={(checked) =>
                  setTemplate({ ...template, includeOrderLink: checked === true })
                }
              />
              <Label htmlFor="includeOrderLink">Include Amazon order link in description</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriptionTemplate">Description template</Label>
              <Textarea
                id="descriptionTemplate"
                value={template.descriptionTemplate}
                onChange={(event) =>
                  setTemplate({ ...template, descriptionTemplate: event.target.value })
                }
                rows={8}
                className="font-mono text-body"
              />
              <p className="text-caption leading-5 text-muted-foreground">
                Available placeholders: {'{productName}'}, {'{productDescription}'},{' '}
                {'{originalPrice}'}, {'{sellingPrice}'}, {'{orderDate}'}, {'{condition}'}
              </p>
            </div>

            <div className="flex items-center gap-3 border-t pt-4">
              <Button type="button" onClick={() => void handleSave()}>
                Save settings
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTemplate(DEFAULT_TEMPLATE)}
              >
                Reset to default
              </Button>
              {saved ? (
                <Badge variant="secondary" aria-live="polite">
                  Saved
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
