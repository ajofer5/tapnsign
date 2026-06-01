import { BLANK_CARD_TEMPLATE } from '@/lib/card-templates/blank';
import { BLUR_CARD_TEMPLATE } from '@/lib/card-templates/blur';
import { CLASSIC_CARD_TEMPLATE, CLASSIC_PRINT_TEMPLATE } from '@/lib/card-templates/classic';
import { OPHINIA_O_CARD_TEMPLATE } from '@/lib/card-templates/ophinia-o';
import { CardTemplate } from '@/lib/card-templates/types';

export const CARD_TEMPLATES: Record<string, CardTemplate> = {
  [BLANK_CARD_TEMPLATE.id]: BLANK_CARD_TEMPLATE,
  [BLUR_CARD_TEMPLATE.id]: BLUR_CARD_TEMPLATE,
  [OPHINIA_O_CARD_TEMPLATE.id]: OPHINIA_O_CARD_TEMPLATE,
  [CLASSIC_CARD_TEMPLATE.id]: CLASSIC_CARD_TEMPLATE,
};

export const DISPLAY_CARD_TEMPLATES: CardTemplate[] = [
  BLANK_CARD_TEMPLATE,
  BLUR_CARD_TEMPLATE,
  CLASSIC_CARD_TEMPLATE,
  OPHINIA_O_CARD_TEMPLATE,
];

export function getCardTemplate(templateId: string | null | undefined): CardTemplate {
  if (templateId && CARD_TEMPLATES[templateId]) {
    return CARD_TEMPLATES[templateId];
  }
  return CLASSIC_CARD_TEMPLATE;
}

export type { CardTemplate } from '@/lib/card-templates/types';
export { BLANK_CARD_TEMPLATE, BLUR_CARD_TEMPLATE, CLASSIC_CARD_TEMPLATE, CLASSIC_PRINT_TEMPLATE, OPHINIA_O_CARD_TEMPLATE };
