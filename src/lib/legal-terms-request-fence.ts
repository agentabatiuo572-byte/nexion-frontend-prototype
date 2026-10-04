export interface LegalTermsRequest {
  generation: number;
  locale: string;
}

/** A late legal-document response must never decide another locale's gate. */
export function createLegalTermsRequestFence() {
  let generation = 0;
  let latestLocale = "";
  return {
    start(locale: string): LegalTermsRequest {
      generation += 1;
      latestLocale = locale;
      return { generation, locale };
    },
    isCurrent(request: LegalTermsRequest, locale: string, responseRequestedLocale = request.locale): boolean {
      return request.generation === generation
        && request.locale === locale
        && request.locale === responseRequestedLocale;
    },
    isLatestLocale(locale: string): boolean {
      return generation > 0 && latestLocale === locale;
    },
    invalidate(): void {
      generation += 1;
      latestLocale = "";
    },
  };
}
