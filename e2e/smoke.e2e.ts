import { expect, test } from '@playwright/test';

test('a first contribution recorded in Admin shows up in Resumen and Movimientos', async ({ page }) => {
  await page.route('https://www.datos.gov.co/**', route => route.fulfill({ json: [{ valor: '4000' }] }));
  await page.goto('/');

  await page.locator('#nav-admin').click();
  await page.getByLabel('Clave de acceso').fill('e2e');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('button', { name: /Participantes/ }).click();
  await page.getByLabel('Nuevo participante').fill('Ana');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByRole('button', { name: /Participantes/ })).toContainText('1 activos');

  await page.getByRole('button', { name: 'Movimiento', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#f-monto').pressSequentially('1000');
  await page.locator('#f-monto-cop').pressSequentially('4000000');
  await page.locator('#f-valor-mov').pressSequentially('1000');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByText(/Aporte de Ana por .* guardado/)).toBeVisible();

  await page.locator('#nav-resumen').click();
  const resumen = page.locator('#tab-resumen');
  await expect(resumen).toContainText('US$ 1.000');
  await expect(resumen).toContainText('100%');
  await expect(resumen).toContainText('Ana');

  await page.locator('#nav-movimientos').click();
  await expect(page.locator('#tab-movimientos')).toContainText('+US$ 1.000,00');
});
