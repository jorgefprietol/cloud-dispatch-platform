import {test,expect} from '@playwright/test';
test('operator creates an express order and downloads its dispatch report',async({page})=>{
  const customer=`E2E ${Date.now()}`;
  await page.goto('/');await expect(page.getByRole('heading',{name:'Todo en movimiento.'})).toBeVisible();
  await page.getByRole('button',{name:'Nuevo pedido',exact:true}).click();
  await page.getByLabel('Cliente',{exact:true}).fill(customer);await page.getByLabel('Destino',{exact:true}).fill('Quito');
  await page.getByLabel('Prioridad',{exact:true}).selectOption('express');await page.getByLabel('Importe (USD)',{exact:true}).fill('240.50');
  await page.getByRole('button',{name:'Registrar pedido',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Buscar pedidos').fill(customer);
  const row=page.getByRole('row').filter({hasText:customer});await expect(row).toContainText('Despachado',{timeout:60000});
  await row.getByRole('button',{name:customer,exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('CD-');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar reporte'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^dispatch-.*\.json$/);
});
test('responsive console renders without horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.getByRole('button',{name:'Nuevo pedido',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
