import asyncio
import os
from playwright.async_api import async_playwright

async def run_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = await context.new_page()

        console_errors = []
        page_errors = []

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        file_path = "file://" + os.path.abspath("Lyceum/black-scholes/index.html")
        print(f"Loading {file_path}...")
        await page.goto(file_path, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)

        print("Console errors on load:", console_errors)
        print("Page errors on load:", page_errors)
        assert len(console_errors) == 0, f"Found console errors: {console_errors}"
        assert len(page_errors) == 0, f"Found page errors: {page_errors}"

        # 1. Test Module 1 Monte Carlo
        print("Testing Module 1 Monte Carlo...")
        btn_mc = page.locator("button:has-text('Przelicz Nowe Ścieżki')")
        await btn_mc.click()
        await page.wait_for_timeout(500)
        emp_prob = await page.locator("#mcValEmpirical").inner_text()
        print(f"Module 1 Empirical Prob: {emp_prob}")

        # 2. Test Module 3 Pricing Lab
        print("Testing Module 3 Pricing Lab...")
        slider_s = page.locator("#labSliderS")
        await slider_s.fill("110")
        await page.wait_for_timeout(500)
        call_val = await page.locator("#kpiCallPrice").inner_text()
        print(f"Module 3 Call Price for S=110: {call_val}")
        assert "110 $" in await page.locator("#labValS").inner_text()

        # 3. Test Module 4 Greeks
        print("Testing Module 4 Greeks tabs...")
        gamma_tab = page.locator(".greek-tab-btn[data-greek='gamma']")
        await gamma_tab.click()
        await page.wait_for_timeout(500)
        gamma_val = await page.locator("#valGreekGamma").inner_text()
        print(f"Module 4 Gamma Value: {gamma_val}")

        # 4. Test Module 5 Implied Volatility
        print("Testing Module 5 Implied Volatility Solver...")
        btn_iv = page.locator("button:has-text('Oblicz Zmienność Implikowaną (IV)')")
        await btn_iv.click()
        await page.wait_for_timeout(500)
        res_text = await page.locator("#ivResultText").inner_text()
        print(f"Module 5 IV Result: {res_text[:60]}...")
        assert "Zbieżność osiągnięta" in res_text

        # 5. Test Module 6 Strategies
        print("Testing Module 6 Strategy tab...")
        strat_btn = page.locator(".strat-tab-btn[data-strat='ironCondor']")
        await strat_btn.click()
        await page.wait_for_timeout(500)

        # 6. Test Module 7 Quiz
        print("Testing Module 7 Quiz...")
        opt_b = page.locator("#q_0_opt_1")
        await opt_b.scroll_into_view_if_needed()
        await opt_b.click()
        await page.wait_for_timeout(500)
        exp_visible = await page.locator("#q_0_exp").is_visible()
        print(f"Module 7 Quiz Explanation Visible: {exp_visible}")
        assert exp_visible == True

        # 7. Take dedicated screenshot of Module 1 and full page
        print("Taking Module 1 screenshot...")
        m1_section = page.locator("#m1-intuicja")
        await m1_section.scroll_into_view_if_needed()
        await page.wait_for_timeout(500)
        await m1_section.screenshot(path="Lyceum/black-scholes/screenshot_module1_retina.png")
        print("Saved Lyceum/black-scholes/screenshot_module1_retina.png")

        print("Taking full page screenshot...")
        await page.screenshot(path="Lyceum/black-scholes/screenshot_verified.png", full_page=True)
        print("Saved Lyceum/black-scholes/screenshot_verified.png")

        await browser.close()
        print("All tests passed with 0 errors!")

if __name__ == "__main__":
    asyncio.run(run_tests())
