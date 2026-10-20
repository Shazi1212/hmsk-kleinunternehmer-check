# Kleinunternehmer-Check

Since 2025 a German Kleinunternehmer (§ 19 UStG) loses the status the moment this year's turnover crosses €100,000, with no grace period: this check shows where you stand, tracks your turnover month by month and warns you before the line.

**Use it free:** https://hmsk.life/de/tools/kleinunternehmer-check/ (English: https://hmsk.life/tools/kleinunternehmer-check/)

## What it does

- Eligibility check: previous-year turnover at most €25,000 and current-year turnover at most €100,000; in the year you start, €25,000 (not scaled to a full year).
- Monthly turnover tracker with running totals. Saved in your browser (localStorage), several years side by side; your previous-year tracker can fill in the previous-year total.
- Warnings at 80% and 90% of the limit, a "next order" check (does it still fit? if not, how much VAT is in it), and a heads-up when this year's turnover means no Kleinunternehmer status next year.
- What changes when you lose the status (VAT on invoices, VAT returns, input VAT, e-invoices from 2027/2028).
- The invoice note required by § 34a UStDV, in German and English, ready to copy, plus a link to the free [Invoice](https://hmsk.life/tools/invoice/) tool.
- German and English (`?lang=en`), print-friendly. Nothing is sent to a server.

## Quick start

A static page with no build step and no dependencies.

```sh
python3 -m http.server 8080 --directory public   # then open http://localhost:8080
```

Or copy `public/` to any web server. Site links (tool page, imprint, invoice tool, email signup) point to
`https://hmsk.life`; change `siteBase` in `public/config.js` for your own copy.

## Tests

The limits and calculations live in `public/logic.js` (no DOM, amounts in cents) and are tested with Node's built-in test runner (Node 18+):

```sh
node --test tests/
```

The tests cover the limits, the exact boundaries (€25,000 and €100,000 are still fine, one cent more is not), the
BMF examples, the founding year, the warning levels, the next-order check, VAT on top / VAT inside a price,
amount parsing (1.234,56 and 1,234.56) and that the German and English texts match.

## Legal basis

§ 19 UStG as amended by the Jahressteuergesetz 2024 (in force since 1 January 2025), § 34a UStDV, and the
[BMF letter of 18 March 2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-03-18-sonderregelung-kleinunternehmer.pdf?__blob=publicationFile&v=3)
(sections 14.7a, 19.1, 19.2, 19.7 UStAE). State: 19 October 2026. Not covered: the EU scheme under § 19a UStG,
margin schemes, VAT-exempt turnover.

Not tax advice.

## License

MIT, see [LICENSE](LICENSE). Fonts: Newsreader and Public Sans (SIL Open Font License), in `public/fonts/`; the shared hmsk.life look is in `public/letterpress.css`.
