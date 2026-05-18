from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    print("Navigating to http://localhost:3001")
    page.goto("http://localhost:3001")
    page.wait_for_timeout(2000)

    print("Filling name")
    page.fill("input[placeholder='Enter your name']", "UI_Tester")
    page.wait_for_timeout(500)

    print("Clicking Join")
    page.click("button:has-text('Join Game')")
    page.wait_for_timeout(2000)

    # Check for the new hotkey in the controls list
    print("Checking for Auto-Harvester in controls")
    controls = page.locator(".controls-list")
    if "Alt+Shift+H: Auto-Harvester" in controls.inner_text():
        print("Found Auto-Harvester in controls list!")
    else:
        print("Auto-Harvester NOT found in controls list!")

    # Take screenshot
    page.screenshot(path="verification/screenshots/ui_verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
