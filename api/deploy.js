// Agoric Dapp api deployment script

export default async function deployApi(homeP, { bundleSource, pathResolve }) {
  let overrideInstanceId;
  const dc = `${process.cwd()}/dappConstants.js`;
  let dappConstants;
  try {
    require(dc);
    dappConstants = __DAPP_CONSTANTS__;
    overrideInstanceId = __DAPP_CONSTANTS__.CONTRACT_ID;
  } catch (e) {
    console.log(`Proceeeding with defaults; cannot load ${dc}:`, e.message);
  }
  
  const { source, moduleFormat } = await bundleSource(pathResolve('./handler.js'));
  const handlerInstall = homeP~.spawner~.install(source, moduleFormat);
  const [instance, zoe, registrar] = await Promise.all([
    homeP~.registrar~.get(dappConstants.CONTRACT_ID)
      .then(instanceHandle => homeP~.zoe~.getInstance(instanceHandle)),
    homeP~.zoe,
    homeP~.registrar,
  ]);

  const { issuerKeywordRecord } = instance;
  const brands = {};
  const brandRegKeys = {};
  await Promise.all(Object.entries(dappConstants.BRAND_REGKEYS).map(
    async ([keyword, brandRegKey], index) => {
      brandRegKeys[keyword] = brandRegKey;
      brands[keyword] = await issuerKeywordRecord[keyword]~.getBrand();
    }));

  const handler = handlerInstall~.spawn({brands, brandRegKeys, zoe, registrar, overrideInstanceId});
  await homeP~.http~.registerAPIHandler(handler);
}
