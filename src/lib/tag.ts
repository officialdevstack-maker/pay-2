import { RESERVED_TAGS, TAG_RULES } from '@/config/tags';

export function normalizeTag(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

export type TagCheck = { ok: true; tag: string } | { ok: false; message: string };

export function checkTag(input: string): TagCheck {
  const rawTag = input.trim().replace(/^@/, '');
  if (/[^\x00-\x7F]/.test(rawTag)) {
    return { ok: false, message: 'Use only lowercase letters, numbers and single underscores.' };
  }

  const tag = normalizeTag(input);
  if (tag.length < TAG_RULES.minLength || tag.length > TAG_RULES.maxLength) {
    return { ok: false, message: `Use ${TAG_RULES.minLength} to ${TAG_RULES.maxLength} characters.` };
  }
  if (!TAG_RULES.pattern.test(tag)) {
    return {
      ok: false,
      message: 'Start with a letter, then use letters, numbers and single underscores.',
    };
  }
  if (RESERVED_TAGS.has(tag) || tag.startsWith('spurs')) {
    return { ok: false, message: 'That tag is not available.' };
  }
  return { ok: true, tag };
}
