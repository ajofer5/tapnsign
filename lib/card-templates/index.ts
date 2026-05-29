import { BLUR_CARD_TEMPLATE } from '@/lib/card-templates/blur';
import { CLASSIC_CARD_TEMPLATE, CLASSIC_PRINT_TEMPLATE } from '@/lib/card-templates/classic';
import { OPHINIA_O_CARD_TEMPLATE } from '@/lib/card-templates/ophinia-o';
import { OPHINA_CARD_TEMPLATE } from '@/lib/card-templates/ophina';
import { CardTemplate } from '@/lib/card-templates/types';

export const CARD_TEMPLATES: Record<string, CardTemplate> = {
  [BLUR_CARD_TEMPLATE.id]: BLUR_CARD_TEMPLATE,
  [OPHINIA_O_CARD_TEMPLATE.id]: OPHINIA_O_CARD_TEMPLATE,
  [OPHINA_CARD_TEMPLATE.id]: OPHINA_CARD_TEMPLATE,
  [CLASSIC_CARD_TEMPLATE.id]: CLASSIC_CARD_TEMPLATE,
};

export const DISPLAY_CARD_TEMPLATES: CardTemplate[] = [
  BLUR_CARD_TEMPLATE,
  OPHINIA_O_CARD_TEMPLATE,
  OPHINA_CARD_TEMPLATE,
  CLASSIC_CARD_TEMPLATE,
];

export function getCardTemplate(templateId: string | null | undefined): CardTemplate {
  if (templateId && CARD_TEMPLATES[templateId]) {
    return CARD_TEMPLATES[templateId];
  }
  return CLASSIC_CARD_TEMPLATE;
}

export type { CardTemplate } from '@/lib/card-templates/types';
export { BLUR_CARD_TEMPLATE, CLASSIC_CARD_TEMPLATE, CLASSIC_PRINT_TEMPLATE, OPHINA_CARD_TEMPLATE, OPHINIA_O_CARD_TEMPLATE };
