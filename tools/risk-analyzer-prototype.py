import re, sys, random
RULES = [  # (pattern, points, label) ; + = riskier
 (r'\bbots?\b|\bfake\b', 3, 'bot/fake'),
 (r'no refill|no guarantee|without refill', 2, 'no refill'),
 (r'(?<!non )(?<!low )(?<!no )\bdrop(s|ping)?\b(?! ?rate)', 1, 'drops'),
 (r'super ?fast|instant|ultra ?fast|\d+k ?(-|to) ?\d+k/day|\d+0k/day', 1, 'very fast'),
 (r'\bcheap(est)?\b|\blq\b|low quality|mixed', 1, 'cheap/mixed'),
 (r'not working|unstable|may drop|emergency|test', 2, 'unstable'),
 (r'\breal\b|active|organic|real user', -2, 'real users'),
 (r'non ?drop|no ?drop|low drop|0% drop', -1, 'low/no drop'),
 (r'lifetime|refill ?\d+|\d+ ?days? refill|\br\d{2,3}\b|refill', -2, 'refill'),
 (r'guarantee', -1, 'guarantee'),
 (r'\bhq\b|uhq|premium|vip', -1, 'high quality'),
 (r'\d{2,3} ?- ?\d{3,4}/day|slow|gradual|drip', -1, 'slow/natural speed'),
 (r'targeted|country|usa|french|brazil|turkish', -1, 'targeted'),
]
def analyze(text, refill_flag=None):
    t = text.lower(); score = 0; why = []
    for pat, pts, lab in RULES:
        if re.search(pat, t):
            # "no refill" must not also count as "refill"
            if lab == 'refill' and re.search(r'no refill|without refill', t): continue
            score += pts; why.append(f'{pts:+d} {lab}')
    if refill_flag is False: score += 1; why.append('+1 API: refill=false')
    level = 'LOW' if score <= -2 else 'HIGH' if score >= 2 else 'MEDIUM'
    return level, score, why
if __name__ == '__main__':
    items = [x.strip() for x in open(sys.argv[1]).read().split('|') if x.strip()]
    rows = []
    for i, x in enumerate(items):
        if re.match(r'^(🔵|🟢|🟡|🔴|⚡|🔥)', x) and 15 < len(x) < 120:
            desc = ' / '.join(items[i+1:i+3])
            rows.append((x, desc))
    print('services parsed:', len(rows))
    from collections import Counter
    c = Counter(analyze(n+' '+d)[0] for n, d in rows); print(dict(c))
    random.seed(4)
    for n, d in random.sample(rows, 14):
        lv, sc, why = analyze(n+' '+d)
        print(f'{lv:6} {sc:+d} | {n[:60]} | {d[:45]} | {", ".join(why)}')
