namespace wd
{
class CacheManager{
public:
    friend class Singleton<CacheManager>;
    LRUCache &getKeyCache(std::string pthreadName);
    void periodicUpdateCaches(); //定时更新所有的缓存
    void handleParsersCallback(const std::pair<int, std::string> &msgtype);
    list<pair<string, string>> &getPendingUpdateList();
    CacheManager(const CacheManager &)= delete;
    CacheManager&operator=(const CacheManager &)= delete;
private:
    CacheManager(size_t count);
    vector<pair<string, LRUCache>> _keyCacheList;
    Configuration* _config;
    /* vector<pair<string, LRUCache>> _webPageCacheList; */
    /* LRUCache &getWebPageCache(string pthreadName); */
};
} // namespace wd
