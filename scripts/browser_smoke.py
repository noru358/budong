"""Exercise personal V1 with an isolated browser profile; no real API keys."""
import argparse
import json
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--screenshot-dir')
args = parser.parse_args()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--no-proxy-server'])
    context = browser.new_context(viewport={'width':1280, 'height':900}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if 'Content Security Policy' in msg.text else None)
    response = page.goto(args.base_url+'/web/', wait_until='domcontentloaded')
    assert response.status == 200
    page.locator('#search-form input[name=query]').fill('상도15')
    page.locator('#search-form button').click()
    page.locator('[data-action=project][data-id="seoul-11590-02"]').first.click()
    page.wait_for_function("() => document.querySelector('h1')?.textContent.includes('상도15')")
    assert page.locator('a.source[href^="https://www.eum.go.kr/"]').count() > 0
    assert '고시 정보·본문 재확인일' in page.locator('.evidence').first.inner_text()
    assert '현재단계 최신성 검증' in page.locator('#app').inner_text()

    def create_case(label, price='54000', cost='2970'):
        page.locator('[data-action=new-case]').click()
        values = {'label':label, 'acquisition_date':'2026-10-15', 'contract_price':price,
            'acquisition_incidental_cost':cost, 'existing_deposit_assumed':'14000',
            'initial_loan_draw':'12000', 'paid_contribution':'3500', 'available_cash':'35000',
            'exit_date':'2029-06-30', 'exit_price':'86200', 'exit_selling_cost':'800'}
        for name, value in values.items():
            page.locator(f'#case-form [name="{name}"]').fill(value)
        for i, (date, kind, amount, loan) in enumerate([
            ('2027-06-30','REMAINING_CONTRIBUTION','10000','3500'),
            ('2028-06-30','FINANCING_COST','2200','0')]):
            page.locator('[data-action=add-event]').click()
            page.locator(f'[name=event_{i}_date]').fill(date)
            page.locator(f'[name=event_{i}_kind]').select_option(kind)
            page.locator(f'[name=event_{i}_amount]').fill(amount)
            page.locator(f'[name=event_{i}_loan]').fill(loan)
        page.locator('[data-action=fill-liabilities]').click()
        page.locator('#case-form button[type=submit]').click()
        page.wait_for_selector('[data-action=edit-case]')

    create_case('브라우저 검증 A')
    assert '3.97억' in page.locator('#app').inner_text()
    assert '2027-06-30' in page.locator('#app').inner_text()
    assert page.locator('.kpi').count() == 6
    first_id = page.evaluate("JSON.parse(localStorage.getItem('budong.personal.v1')).cases[0].id")
    page.reload(wait_until='domcontentloaded')
    assert '브라우저 검증 A' in page.locator('#app').inner_text()
    page.locator('[data-action=project]').click()
    page.wait_for_selector('[data-action=new-case]')
    create_case('브라우저 검증 B', '55000', '3025')
    page.locator('#compare-b').select_option(first_id)
    assert '브라우저 검증 A' in page.locator('#app').inner_text()
    assert '브라우저 검증 B' in page.locator('#app').inner_text()
    with page.expect_download() as download_info:
        page.locator('[data-action=export]').click()
    download = download_info.value
    exported = json.loads(open(download.path(), encoding='utf-8').read())
    assert len(exported['cases']) == 2

    if args.screenshot_dir:
        from pathlib import Path
        output = Path(args.screenshot_dir)
        output.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(output/'budong-analysis-desktop.png'), full_page=True)

    page.locator('[data-action=edit-case]').click()
    page.locator('[name=acquisition_incidental_cost]').fill('')
    page.locator('#case-form button[type=submit]').click()
    page.wait_for_selector('[data-action=edit-case]')
    assert page.locator('.kpi').count() == 0
    state = page.evaluate("JSON.parse(localStorage.getItem('budong.personal.v1'))")
    assert state['cases'][1]['acquisition_incidental_cost'] is None
    page.locator('#nav [data-view=home]').click()
    page.wait_for_selector('#search-form')
    assert '브라우저 검증 A' in page.locator('#app').inner_text()
    assert '상도15' in page.locator('#app').inner_text()
    page.set_viewport_size({'width':390, 'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    if args.screenshot_dir:
        page.screenshot(path=str(output/'budong-home-mobile.png'), full_page=True)
    page.locator('#nav [data-view=map]').click()
    page.wait_for_function("() => document.querySelector('#app')?.textContent.includes('FAIL-CLOSED')")
    page.locator('#nav [data-view=analysis]').click()
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('[data-action=delete-case]').click()
    page.wait_for_function("() => JSON.parse(localStorage.getItem('budong.personal.v1')).cases.length === 1")
    assert not errors, errors
    print(json.dumps({'result':'PASS', 'checks':['real project search/source','notice review vs current-stage verification','manual input','calculation','reload persistence','two-case comparison','JSON export','unknown remains null','recent projects','mobile layout','map guard','deletion'], 'page_errors':errors}, ensure_ascii=False))
    browser.close()
