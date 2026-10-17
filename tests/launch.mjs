// Abre o Chrome para os testes: BROWSER_EXECUTABLE aponta para um executável; sem ele usa o Chrome instalado (channel "chrome").
// PLAYWRIGHT_MODULE aponta para o playwright-core (padrão: o instalado em node_modules).
export async function launch(){
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
 return chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'})});
}
