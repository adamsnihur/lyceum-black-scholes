# Lyceum: Wycena Opcji Blacka-Scholesa-Mertona

> Interaktywne kompendium pojęciowe i traktat matematyczny łączący stochastykę, dynamiczny hedging, analityczne rozwiązanie PDE oraz geometrię Greków i zmienności implikowanej.

---

## 🏛️ Moduły Dydaktyczne

1. **Intuicja Geometryczna i Ruch Browna:** Symulator Monte Carlo 45 trajektorii z rozkładem log-normalnym cen akcji i prawdopodobieństwem ITM/OTM.
2. **Analityczne Wyprowadzenie PDE:** Dowód krok po kroku od Lematu Itô, przez konstrukcję bezryzykownego portfela $\Pi = V - \Delta S$, po rozwiązanie równania dyfuzji ciepła i wzory zamknięte.
3. **Laboratorium Wyceny (Pricing Lab):** Reaktywny kalkulator w 60 FPS z dekompozycją wartości wewnętrznej vs czasowej oraz weryfikacją parytetu Put-Call.
4. **Geometria Greków:** Analiza wrażliwości pierwszego i drugiego rzędu (Delta, Gamma, Vega, Theta, Rho) wraz z wizualizacją zjawiska *Gamma Pin Risk* dla krótkich terminów wygaśnięcia.
5. **Zmienność Implikowana i Volatility Smile:** Numeryczny solwer Newtona-Raphsona z tabelą iteracji oraz wyjaśnieniem rynkowego uśmiechu/skoszenia zmienności po krachu 1987 r.
6. **Profiler Strategii Opcyjnych:** P&L dla strategii kombinowanych (Straddle, Strangle, Covered Call, Protective Put, Iron Condor, Bull Call Spread).
7. **Sprawdzian Zrozumienia (Quiz PhD):** Zestaw 5 pytań testujących intuicję z natychmiastowym feedbackiem.
8. **Kod Produkcyjny w Pythonie:** Kompletna, wektoryzowana klasa `BlackScholesEngine` w NumPy/SciPy.
9. **Bibliografia Naukowa:** Kluczowe publikacje Black-Scholes (1973) oraz Merton (1973).

---

## 🚀 Uruchomienie

Otwórz bezpośrednio w przeglądarce:
```bash
open "Lyceum/black-scholes/index.html"
```
