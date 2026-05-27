# PCS Getiri Hesaplayıcı

Put / Bull Credit Spread (PCS / BCS) getiri, ROC ve risk hesaplama uygulaması. Offline çalışan PWA.

Aynı anda 5 farklı parametre setini alt alta hesaplar, en iyi metrikleri otomatik olarak işaretler ve CSV olarak dışa aktarır.

## Giriş alanları (her senaryo için)

- Kanat genişliği ($)
- Alınan prim ($)
- Take profit (%) — primin yüzde kaçında kâr alınır
- Stop loss (%) — primin kaç katında stop verilir
- Win rate (%)
- Kontrat sayısı (pozisyon başına)
- Elde tutma süresi / DTE (gün)
- **Eşzamanlı pozisyon sayısı** — aynı anda kaç pozisyon açık

## Model

- **Aylık trade sayısı** = Eşzamanlı × (30 ÷ DTE)
- **Kullanılan sermaye** = Eşzamanlı × Kontrat × (Kanat − Prim) × 100
- **Aylık ROC** = Aylık gelir ÷ Kullanılan sermaye

Örnek: DTE=10 gün, eşzamanlı=20 pozisyon → aylık 60 trade, sermaye = 20 pozisyonun toplam teminatı.

## Hesaplanan metrikler

- Aylık beklenen prim geliri, aylık & yıllık ROC
- Toplam kullanılan sermaye ve pozisyon başına sermaye
- Aylık trade sayısı (türetilmiş) ve aylık cycle
- Beklenen değer / trade, ROC / trade
- Max kâr (TP) ve max zarar (SL) / trade
- Risk / ödül oranı, breakeven win rate, edge (WR − BE)

## Karşılaştırma

Tüm senaryolar tek tabloda kıyaslanır, her metrikte en iyi sonuç ★ ile işaretlenir.

## Çalıştırma

Statik dosyalar. Yerelde bir HTTP sunucusu üzerinden açıldığında PWA olarak yüklenebilir ve offline çalışır:

```bash
python3 -m http.server 8000
# tarayıcıda: http://localhost:8000
```

GitHub Pages üzerinde de host edilebilir (Settings → Pages → branch seçimi).

## Not

Veriler yalnızca tarayıcının `localStorage`'ında tutulur. Yatırım tavsiyesi değildir.
