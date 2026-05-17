import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"BROWSER ERROR: {exc}"))

        # Connect to the game
        print("Navigating to http://localhost:3001")
        try:
            await page.goto("http://localhost:3001", timeout=60000)
            print("Page loaded")

            await page.fill("input[placeholder='Enter your name']", "Tester")
            print("Filled name")
            await page.click("button:has-text('Join Game')")
            print("Clicked Join")

            # Wait for login overlay to disappear
            await page.wait_for_selector(".login-overlay", state="hidden", timeout=15000)
            print("Login overlay hidden")

            # Check for UI elements
            await page.wait_for_selector(".ui-overlay", timeout=10000)
            print("UI Overlay present")

            await page.wait_for_selector(".stamina-container", timeout=10000)
            print("Stamina bar present")

            # Take a screenshot
            os.makedirs("verification/screenshots", exist_ok=True)
            await page.screenshot(path="verification/screenshots/final_verification.png")
            print("Screenshot taken")

        except Exception as e:
            print(f"Verification failed: {e}")
            await page.screenshot(path="verification/screenshots/error.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
