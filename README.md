# PCS Getiri Hesaplayıcı

Put / Bull Credit Spread (PCS / BCS) getiri, ROC ve risk hesaplama uygulaması. Offline çalışan PWA.

Aynı anda 5 farklı parametre setini alt alta hesaplar, en iyi metrikleri otomatik olarak işaretler ve CSV olarak dışa aktarır.

## Giriş alanları (her senaryo için)

- Kanat genişliği ($)
- Alınan prim ($)
- Take profit (%) — primin yüzde kaçında kâr alınır
- Stop loss (%) — primin kaç katında stop verilir
- Win rate (%)
- Kontrat sayısı
- Elde tutma süresi (gün)
- Aylık trade sayısı

## Hesaplanan metrikler

- Aylık beklenen prim geliri
- Aylık ROC ve yıllık ROC
- Yatırılan sermaye / pozisyon ve tepe sermaye (overlap'a göre)
- Beklenen değer / trade, ROC / trade
- Max kâr (TP) ve max zarar (SL) / trade
- Teorik max zarar
- Risk / ödül oranı
- Breakeven win rate ve edge (WR − BE)

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
